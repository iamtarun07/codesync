/**
 * Code-execution check for the `code:run` socket flow.
 *
 *   1. start the backend:  npm run server   (from the repo root)
 *   2. run this check:     npm run check:run   (from client/)
 *
 * Requires outbound network access to PISTON_URL.
 */
import axios from 'axios';
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const API = 'http://localhost:5000/api';
const WS = 'http://localhost:5000';
const stamp = Date.now();
const results = [];

function check(name, condition, detail = '') {
  results.push(condition);
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function tokenFrom(res) {
  const raw = res.headers['set-cookie']?.find((c) => c.startsWith('codesync_token='));
  return raw ? raw.split(';')[0].split('=')[1] : null;
}

async function main() {
  const reg = await axios.post(`${API}/auth/register`, {
    username: `runner${stamp}`.slice(0, 20),
    email: `runner${stamp}@example.com`,
    password: 'Password123',
  });
  const token = tokenFrom(reg);
  const headers = { Cookie: `codesync_token=${token}` };

  const created = await axios.post(
    `${API}/rooms`,
    { name: 'Run Room', language: 'python' },
    { headers },
  );
  const roomId = created.data.data.room.roomId;
  const fileId = created.data.data.room.files[0].fileId;

  const ydoc = new Y.Doc();
  const socket = io(WS, { auth: { token }, transports: ['websocket'] });
  const events = { running: null, output: null, failed: null, ready: false };

  ydoc.on('update', (update, origin) => {
    if (origin !== 'remote' && events.ready) socket.emit('doc:update', { roomId, fileId, update });
  });
  socket.on('room:state', () => socket.emit('file:open', { roomId, fileId }));
  socket.on('file:state', (p) => {
    if (p.fileId !== fileId) return;
    if (p.docState?.byteLength) Y.applyUpdate(ydoc, new Uint8Array(p.docState), 'remote');
    events.ready = true;
  });
  socket.on('code:running', (p) => (events.running = p));
  socket.on('code:output', (p) => (events.output = p));
  socket.on('code:failed', (p) => (events.failed = p));
  socket.on('error', (e) => console.log(`  server error: ${e.code} ${e.message}`));

  await wait(700);
  socket.emit('room:join', { roomId });
  await wait(1200);
  check('file stream attached', events.ready);

  // --- happy path: stdout + stdin ---------------------------------------
  ydoc.getText('monaco').insert(0, 'name = input()\nprint("hello", name)\nprint(2 ** 10)\n');
  await wait(600);

  socket.emit('code:run', { roomId, fileId, stdin: 'codesync\n' });
  for (let i = 0; i < 40 && !events.output && !events.failed; i += 1) await wait(500);

  check('code:running broadcast before execution', Boolean(events.running), events.running?.by);
  check('code:output received', Boolean(events.output), events.failed?.message ?? '');
  check(
    'stdout is correct',
    events.output?.stdout?.includes('hello codesync') && events.output?.stdout?.includes('1024'),
    JSON.stringify(events.output?.stdout),
  );
  check('exit code is 0', events.output?.exitCode === 0, String(events.output?.exitCode));
  check('runtime reported', Boolean(events.output?.runtime), events.output?.runtime);

  // --- runtime error goes to stderr, not a crash ------------------------
  events.output = null;
  events.failed = null;
  const text = ydoc.getText('monaco');
  text.delete(0, text.length);
  text.insert(0, 'raise ValueError("boom")\n');
  await wait(600);

  socket.emit('code:run', { roomId, fileId, stdin: '' });
  for (let i = 0; i < 40 && !events.output && !events.failed; i += 1) await wait(500);

  check('runtime error captured in stderr', Boolean(events.output?.stderr?.includes('boom')),
    JSON.stringify(events.output?.stderr?.slice(0, 120)));
  check('non-zero exit code', (events.output?.exitCode ?? 0) !== 0, String(events.output?.exitCode));

  // --- a second language proves the runtime dispatch --------------------
  events.output = null;
  events.failed = null;
  socket.emit('room:language', { roomId, fileId, language: 'javascript' });
  await wait(500);
  text.delete(0, text.length);
  text.insert(0, 'console.log("js works", [1,2,3].map(n => n * 2).join(","));\n');
  await wait(600);

  socket.emit('code:run', { roomId, fileId, stdin: '' });
  for (let i = 0; i < 40 && !events.output && !events.failed; i += 1) await wait(500);
  check(
    'javascript runs',
    events.output?.stdout?.includes('js works 2,4,6'),
    JSON.stringify(events.output?.stdout ?? events.failed?.message),
  );

  // --- infinite loop is killed by the timeout ---------------------------
  events.output = null;
  events.failed = null;
  text.delete(0, text.length);
  text.insert(0, 'while (true) {}\n');
  await wait(600);

  socket.emit('code:run', { roomId, fileId, stdin: '' });
  for (let i = 0; i < 60 && !events.output && !events.failed; i += 1) await wait(500);
  check(
    'infinite loop is terminated by the timeout',
    Boolean(events.output?.stderr?.includes('timed out')),
    JSON.stringify(events.output?.stderr ?? events.failed?.message),
  );

  // --- non-runnable language is refused ---------------------------------
  events.output = null;
  events.failed = null;
  socket.emit('room:language', { roomId, fileId, language: 'html' });
  await wait(600);
  socket.emit('code:run', { roomId, fileId, stdin: '' });
  await wait(1500);
  check('non-runnable language refused', events.failed?.code === 'LANGUAGE_NOT_RUNNABLE',
    events.failed?.code ?? 'no code:failed');

  // --- room scoping still enforced --------------------------------------
  const outsider = io(WS, { auth: { token }, transports: ['websocket'] });
  await new Promise((resolve) => {
    outsider.on('connect', () => {
      const timer = setTimeout(() => {
        check('code:run rejected for a room never joined', false, 'no error emitted');
        resolve();
      }, 2000);
      outsider.on('error', (e) => {
        clearTimeout(timer);
        check('code:run rejected for a room never joined', e.code === 'NOT_IN_ROOM', e.code);
        resolve();
      });
      outsider.emit('code:run', { roomId, fileId, stdin: '' });
    });
  });
  outsider.close();
  socket.close();

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed} passed, ${results.length - passed} failed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((err) => {
  console.error('Run check crashed:', err.response?.data ?? err.message);
  process.exit(1);
});
