/**
 * File-explorer check: files created under many different names get the right
 * language, bad names are refused, and each runnable file actually runs.
 *
 *   1. start the backend:  npm run dev   (from server/)
 *   2. run this check:     npm run check:files   (from client/)
 */
import axios from 'axios';
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const API = 'http://localhost:5000/api';
const WS = 'http://localhost:5000';
const stamp = Date.now().toString().slice(-8);
const results = [];

function check(name, condition, detail = '') {
  results.push(condition);
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => {
  for (let t = 0; t < ms; t += 250) {
    if (fn()) return true;
    await wait(250);
  }
  return false;
};

async function main() {
  const reg = await axios.post(`${API}/auth/register`, {
    username: `files${stamp}`,
    email: `files${stamp}@example.com`,
    password: 'Password123',
  });
  const raw = reg.headers['set-cookie']?.find((c) => c.startsWith('codesync_token='));
  const token = raw.split(';')[0].split('=')[1];
  const created = await axios.post(
    `${API}/rooms`,
    { name: 'Files Room', language: 'python' },
    { headers: { Cookie: `codesync_token=${token}` } },
  );
  const roomId = created.data.data.room.roomId;

  const socket = io(WS, { auth: { token }, transports: ['websocket'] });
  const state = { files: [], errors: [], output: null, failed: null, fileState: {} };
  socket.on('room:state', (p) => (state.files = p.files));
  socket.on('room:files', (p) => (state.files = p.files));
  socket.on('error', (e) => state.errors.push(e));
  socket.on('file:state', (p) => (state.fileState[p.fileId] = p));
  socket.on('code:output', (p) => (state.output = p));
  socket.on('code:failed', (p) => (state.failed = p));

  await until(() => socket.connected, 5000);
  socket.emit('room:join', { roomId });
  await until(() => state.files.length > 0, 5000);

  const byPath = (path) => state.files.find((f) => f.path === path);
  const create = async (path, type = 'file') => {
    state.errors.length = 0;
    socket.emit('file:create', { roomId, path, type });
    await until(() => byPath(path) || state.errors.length, 4000);
    return byPath(path);
  };

  // --- names map to the right language ----------------------------------
  const expected = {
    'app.py': 'python',
    'util.ts': 'typescript',
    'Solution.java': 'java',
    'prog.c': 'c',
    'algo.cpp': 'cpp',
    'index.html': 'html',
    'style.css': 'css',
    'data.JSON': 'json',
    'query.sql': 'sql',
    'notes.txt': 'plaintext',
    README: 'plaintext',
    'my-file_v2.test.js': 'javascript',
    'Main.py': 'python',
    'src/lib/deep.js': 'javascript',
  };
  for (const [path, language] of Object.entries(expected)) {
    const file = await create(path);
    check(`create ${path} as ${language}`, file?.language === language,
      file ? file.language : state.errors[0]?.message ?? 'not created');
  }
  check('nested path creates its folders',
    byPath('src')?.type === 'folder' && byPath('src/lib')?.type === 'folder');
  check('main.py and Main.py coexist', Boolean(byPath('main.py') && byPath('Main.py')));

  // --- bad names are refused with a message, nothing is created ---------
  const bad = {
    'my file.js': 'space',
    '../evil.py': 'parent traversal',
    '.env': 'leading dot',
    'a/b/c/d/e/f/g.js': 'too deep',
    [`${'x'.repeat(41)}.js`]: 'too long',
    'app.py': 'duplicate',
    'café.py': 'non-ascii',
  };
  for (const [path, why] of Object.entries(bad)) {
    const before = state.files.length;
    state.errors.length = 0;
    socket.emit('file:create', { roomId, path, type: 'file' });
    await until(() => state.errors.length, 3000);
    check(`refuse ${why} (${path})`,
      state.errors.length > 0 && state.files.length === before,
      state.errors[0]?.code ?? 'no error');
  }

  // --- each runnable file runs as its own language ----------------------
  const run = async (path, code) => {
    const file = byPath(path);
    const ydoc = new Y.Doc();
    let ready = false;
    ydoc.on('update', (update, origin) => {
      if (origin !== 'remote' && ready) socket.emit('doc:update', { roomId, fileId: file.fileId, update });
    });
    delete state.fileState[file.fileId];
    socket.emit('file:open', { roomId, fileId: file.fileId });
    await until(() => state.fileState[file.fileId], 4000);
    const docState = state.fileState[file.fileId]?.docState;
    if (docState?.byteLength) Y.applyUpdate(ydoc, new Uint8Array(docState), 'remote');
    ready = true;
    ydoc.getText('monaco').insert(0, code);
    await wait(600);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      state.output = null;
      state.failed = null;
      socket.emit('code:run', { roomId, fileId: file.fileId, stdin: '' });
      await until(() => state.output || state.failed, 30000);
      // The server allows 5 runs a minute; wait the window out once.
      if (state.failed?.code !== 'RATE_LIMITED') break;
      await wait(61000);
    }
    return state.output ?? state.failed;
  };

  const runs = [
    ['app.py', 'print("py", 6 * 7)\n', 'py 42'],
    ['util.ts', 'const n: number = 42;\nconsole.log("ts", n);\n', 'ts 42'],
    ['src/lib/deep.js', 'console.log("js", 6 * 7);\n', 'js 42'],
    ['my-file_v2.test.js', 'console.log("dash", 1);\n', 'dash 1'],
    ['Main.py', 'print("upper")\n', 'upper'],
    [
      'Solution.java',
      'public class Solution {\n  public static void main(String[] a) {\n    System.out.println("java 42");\n  }\n}\n',
      'java 42',
    ],
  ];
  for (const [path, code, want] of runs) {
    const out = await run(path, code);
    check(`run ${path}`, out?.stdout?.includes(want),
      JSON.stringify(out?.stdout ?? out?.stderr ?? out?.message)?.slice(0, 160));
  }

  // C/C++ need a compiler: locally that may be missing; it must fail cleanly.
  for (const path of ['prog.c', 'algo.cpp']) {
    const out = await run(path, 'int main(void) { return 0; }\n');
    check(`run ${path} finishes or fails cleanly`, Boolean(out),
      JSON.stringify(out?.stderr || out?.message || out?.exitCode)?.slice(0, 160));
  }

  const txt = await run('notes.txt', 'just notes\n');
  check('notes.txt refused as not runnable', txt?.code === 'LANGUAGE_NOT_RUNNABLE', txt?.code);

  // --- rename follows the new extension ---------------------------------
  const app = byPath('app.py');
  socket.emit('file:rename', { roomId, fileId: app.fileId, name: 'app.js' });
  await until(() => byPath('app.js'), 4000);
  check('rename app.py -> app.js switches to javascript', byPath('app.js')?.language === 'javascript');
  state.errors.length = 0;
  socket.emit('file:rename', { roomId, fileId: app.fileId, name: 'bad name.js' });
  await until(() => state.errors.length, 3000);
  check('rename to bad name refused', state.errors[0]?.code === 'BAD_PATH', state.errors[0]?.code);

  socket.close();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed} passed, ${results.length - passed} failed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((err) => {
  console.error('Files check crashed:', err.response?.data ?? err.message);
  process.exit(1);
});
