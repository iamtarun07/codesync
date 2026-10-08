/**
 * Socket.IO / Yjs end-to-end check — MVP contract + Phase 2 features.
 *
 * Drives three headless collaborators through the whole real-time contract:
 * handshake auth, room join, per-file CRDT documents, concurrent editing,
 * awareness, language sync, chat, role enforcement (viewer read-only), file
 * tree operations, share-by-link joins, room passwords, activity log,
 * reconnect resynchronisation, presence cleanup and MongoDB persistence.
 *
 *   1. start the backend:  npm run server   (from the repo root)
 *   2. run this check:     npm run check:collab   (from client/)
 *
 * Exits non-zero if any assertion fails.
 */
import axios from 'axios';
import { io } from 'socket.io-client';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';

const API = 'http://localhost:5000/api';
const WS = 'http://localhost:5000';
const stamp = Date.now();
const ok = [];
const fail = [];

function check(name, condition, detail = '') {
  (condition ? ok : fail).push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function tokenFrom(res) {
  const raw = res.headers['set-cookie']?.find((c) => c.startsWith('codesync_token='));
  return raw ? raw.split(';')[0].split('=')[1] : null;
}

async function registerUser(name) {
  const res = await axios.post(`${API}/auth/register`, {
    username: name,
    email: `${name}${stamp}@example.com`,
    password: 'Password123',
  });
  return { user: res.data.data.user, token: tokenFrom(res) };
}

const as = (token) => ({ headers: { Cookie: `codesync_token=${token}` } });

/**
 * Mirrors client/src/features/editor/useCollabSession.ts: one Y.Doc per open
 * file, outgoing updates suppressed until the file stream is attached, and a
 * state diff replayed on (re)attach so nothing is lost across a reconnect.
 */
function makeClient(token, roomId, label) {
  const socket = io(WS, { auth: { token }, transports: ['websocket'] });
  const state = {
    socket,
    label,
    ydoc: null,
    awareness: null,
    fileId: null,
    ready: false,
    joined: false,
    role: null,
    files: [],
    settings: null,
    members: [],
    chats: [],
    activity: [],
    language: null,
    errors: [],
  };

  const text = () => (state.ydoc ? state.ydoc.getText('monaco').toString() : '');
  state.text = text;

  state.openFile = (fileId) => {
    if (state.ydoc) {
      state.ydoc.destroy();
      state.awareness?.destroy();
    }
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    state.ydoc = ydoc;
    state.awareness = awareness;
    state.fileId = fileId;
    state.ready = false;

    awareness.setLocalStateField('user', { name: label, color: '#22d3ee' });

    ydoc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      if (!state.ready || !socket.connected) return;
      socket.emit('doc:update', { roomId, fileId, update });
    });
    awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === 'remote' || !state.ready) return;
      const clients = [...added, ...updated, ...removed];
      if (clients.length) {
        socket.emit('awareness:update', {
          roomId,
          fileId,
          update: encodeAwarenessUpdate(awareness, clients),
        });
      }
    });

    if (state.joined) socket.emit('file:open', { roomId, fileId });
  };

  socket.on('room:state', (p) => {
    state.joined = true;
    state.role = p.role;
    state.files = p.files;
    state.settings = p.settings;
    if (state.fileId) socket.emit('file:open', { roomId, fileId: state.fileId });
  });

  socket.on('file:state', (p) => {
    if (p.fileId !== state.fileId) return;
    const incoming = new Uint8Array(p.docState);
    if (incoming.byteLength) Y.applyUpdate(state.ydoc, incoming, 'remote');
    state.ready = true;
    state.language = p.language;

    // Replay anything the server has not seen (offline edits).
    if (state.role !== 'viewer') {
      const missing = Y.encodeStateAsUpdate(state.ydoc, Y.encodeStateVectorFromUpdate(incoming));
      if (missing.byteLength > 2) {
        socket.emit('doc:update', { roomId, fileId: state.fileId, update: missing });
      }
    }
    state.awareness.setLocalStateField('user', { name: label, color: '#22d3ee' });
  });

  socket.on('doc:update', (p) => {
    if (p.fileId !== state.fileId) return;
    Y.applyUpdate(state.ydoc, new Uint8Array(p.update), 'remote');
  });
  socket.on('awareness:update', (p) => {
    if (p.fileId !== state.fileId) return;
    applyAwarenessUpdate(state.awareness, new Uint8Array(p.update), 'remote');
  });
  socket.on('room:members', (p) => (state.members = p.members));
  socket.on('room:files', (p) => (state.files = p.files));
  socket.on('room:settings', (p) => (state.settings = p.settings));
  socket.on('room:role', (p) => {
    state.role = p.role;
    // Mirrors the client: a role change re-opens the file to resynchronise.
    if (state.fileId) socket.emit('file:open', { roomId, fileId: state.fileId });
  });
  socket.on('activity:new', (p) => state.activity.push(p));
  socket.on('chat:message', (m) => state.chats.push(m));
  socket.on('room:language', (p) => (state.language = p.language));
  socket.on('error', (e) => {
    state.errors.push(e);
    console.log(`  [${label}] server error: ${e.code} ${e.message}`);
  });

  return state;
}

async function main() {
  // --- unauthenticated socket must be rejected ---------------------------
  await new Promise((resolve) => {
    const anon = io(WS, { transports: ['websocket'], reconnection: false });
    anon.on('connect', () => {
      check('socket rejects unauthenticated handshake', false, 'it connected');
      anon.close();
      resolve();
    });
    anon.on('connect_error', (err) => {
      check(
        'socket rejects unauthenticated handshake',
        err.message === 'UNAUTHENTICATED',
        err.message,
      );
      anon.close();
      resolve();
    });
  });

  const alice = await registerUser('alice');
  const bob = await registerUser('bob');
  const carol = await registerUser('carol');
  // Registered up front so the auth rate limit is not hit mid-run.
  const stranger = await registerUser('dave');
  check(
    'register returns a session cookie',
    Boolean(alice.token && bob.token && carol.token && stranger.token),
  );

  const created = await axios.post(
    `${API}/rooms`,
    { name: 'E2E Room', language: 'javascript' },
    as(alice.token),
  );
  const room = created.data.data.room;
  const roomId = room.roomId;
  check('room created', Boolean(roomId), roomId);
  check('new room starts with one file', room.files.length === 1, JSON.stringify(room.files[0]?.path));
  check('creator is owner', room.myRole === 'owner', String(room.myRole));

  const mainFile = room.files[0].fileId;

  await axios.post(`${API}/rooms/${roomId}/join`, {}, as(bob.token));
  // Joining by ID is read-only; the owner promotes a collaborator to edit.
  await axios.patch(
    `${API}/rooms/${roomId}/members/${bob.user.id}/role`,
    { role: 'editor' },
    as(alice.token),
  );

  const a = makeClient(alice.token, roomId, 'alice');
  const b = makeClient(bob.token, roomId, 'bob');
  a.openFile(mainFile);
  b.openFile(mainFile);
  await wait(700);
  a.socket.emit('room:join', { roomId });
  b.socket.emit('room:join', { roomId });
  await wait(1200);

  check('both clients received room:state', a.joined && b.joined);
  check('both clients received file:state', a.ready && b.ready);
  check(
    'presence lists both users online',
    a.members.filter((m) => m.online).length === 2,
    JSON.stringify(a.members.map((m) => `${m.username}:${m.role}:${m.online ? 'on' : 'off'}`)),
  );

  // --- TEST 1: collaborative editing -------------------------------------
  a.ydoc.getText('monaco').insert(0, 'const answer = 42;\n');
  await wait(500);
  // The room starts with hello-world starter code, so compare peers, not a literal.
  check(
    'B sees A typing',
    b.text() === a.text() && b.text().startsWith('const answer = 42;\n'),
    JSON.stringify(b.text()),
  );

  // Simultaneous edits at different offsets — CRDT must converge, not clobber.
  a.ydoc.getText('monaco').insert(0, '// alice\n');
  b.ydoc.getText('monaco').insert(b.ydoc.getText('monaco').length, '// bob\n');
  await wait(800);
  check('concurrent edits converge', a.text() === b.text(), JSON.stringify(a.text()));
  check(
    'no content lost',
    a.text().includes('// alice') && a.text().includes('// bob') && a.text().includes('42'),
  );

  // Both editing the same region at once.
  a.ydoc.getText('monaco').insert(0, 'A');
  b.ydoc.getText('monaco').insert(0, 'B');
  await wait(800);
  check('same-offset concurrent inserts converge', a.text() === b.text(), JSON.stringify(a.text().slice(0, 12)));

  // --- awareness / cursors ----------------------------------------------
  a.awareness.setLocalStateField('selection', { anchor: 1, head: 3 });
  await wait(400);
  check(
    'B receives A awareness (cursor + selection) state',
    [...b.awareness.getStates().values()].some((s) => s.user?.name === 'alice'),
  );

  // --- language sync -----------------------------------------------------
  a.socket.emit('room:language', { roomId, fileId: mainFile, language: 'python' });
  await wait(500);
  check('language change propagates', b.language === 'python', String(b.language));

  // --- chat --------------------------------------------------------------
  a.socket.emit('chat:send', { roomId, text: 'hello from alice' });
  await wait(500);
  check('B receives chat message', b.chats.some((m) => m.text === 'hello from alice'));
  check(
    'chat sender comes from the server session',
    b.chats[0]?.sender?.username === 'alice',
    JSON.stringify(b.chats[0]?.sender),
  );

  // --- reconnect resynchronisation ---------------------------------------
  const beforeOffline = a.text();
  b.socket.disconnect();
  await wait(400);
  b.ydoc.getText('monaco').insert(0, '// written while offline\n');
  b.socket.connect();
  await wait(500);
  b.socket.emit('room:join', { roomId });
  await wait(1500);
  check(
    'offline edit survives reconnect on the reconnecting peer',
    b.text().includes('// written while offline'),
  );
  check(
    'offline edit reaches the other peer after reconnect',
    a.text().includes('// written while offline'),
    JSON.stringify(a.text().slice(0, 40)),
  );
  check('reconnected document still converges', a.text() === b.text());
  check('pre-existing content intact after reconnect', b.text().includes(beforeOffline.slice(0, 8)));

  // --- TEST 4: multi-file workspace --------------------------------------
  a.socket.emit('file:create', { roomId, path: 'src/index.js', type: 'file' });
  await wait(600);
  a.socket.emit('file:create', { roomId, path: 'src/utils.js', type: 'file' });
  await wait(700);

  const srcFolder = a.files.find((f) => f.path === 'src' && f.type === 'folder');
  const indexFile = a.files.find((f) => f.path === 'src/index.js');
  const utilsFile = a.files.find((f) => f.path === 'src/utils.js');
  check('missing parent folder is created automatically', Boolean(srcFolder));
  check('both files appear in the tree for every peer', Boolean(indexFile) && Boolean(utilsFile));
  check(
    'file tree propagated to B',
    b.files.some((f) => f.path === 'src/utils.js'),
    String(b.files.length),
  );
  check('language derives from the file name', indexFile?.language === 'javascript', String(indexFile?.language));

  a.socket.emit('file:create', { roomId, path: 'src/index.js', type: 'file' });
  await wait(400);
  check(
    'duplicate path rejected',
    a.errors.some((e) => e.code === 'PATH_TAKEN'),
    JSON.stringify(a.errors.at(-1)),
  );

  // A and B open *different* files: the documents must stay independent.
  a.openFile(indexFile.fileId);
  b.openFile(utilsFile.fileId);
  await wait(1200);
  a.ydoc.getText('monaco').insert(0, 'export const index = 1;\n');
  b.ydoc.getText('monaco').insert(0, 'export const utils = 2;\n');
  await wait(800);
  check('index.js content is not polluted by utils.js', a.text() === 'export const index = 1;\n', JSON.stringify(a.text()));
  check('utils.js content is not polluted by index.js', b.text() === 'export const utils = 2;\n', JSON.stringify(b.text()));

  // Both on the same file again: they collaborate.
  b.openFile(indexFile.fileId);
  await wait(1200);
  check('switching to a file loads its own state', b.text() === 'export const index = 1;\n', JSON.stringify(b.text()));
  b.ydoc.getText('monaco').insert(b.ydoc.getText('monaco').length, '// bob was here\n');
  await wait(700);
  check('same-file collaboration works after a switch', a.text().includes('// bob was here'));

  // --- rename + delete ---------------------------------------------------
  a.socket.emit('file:rename', { roomId, fileId: utilsFile.fileId, name: 'helpers.ts' });
  await wait(700);
  const renamed = a.files.find((f) => f.fileId === utilsFile.fileId);
  check('rename updates path', renamed?.path === 'src/helpers.ts', String(renamed?.path));
  check('rename re-derives the language', renamed?.language === 'typescript', String(renamed?.language));

  a.socket.emit('file:delete', { roomId, fileId: utilsFile.fileId });
  await wait(700);
  check('delete removes the entry', !a.files.some((f) => f.fileId === utilsFile.fileId));

  // --- TEST 2: viewer is read-only ---------------------------------------
  await axios.patch(
    `${API}/rooms/${roomId}/members/${bob.user.id}/role`,
    { role: 'viewer' },
    as(alice.token),
  );
  await wait(700);
  check('role change reaches the affected session', b.role === 'viewer', String(b.role));
  check(
    'role change is visible in the member list',
    a.members.find((m) => m.username === 'bob')?.role === 'viewer',
  );

  const textBeforeViewerEdit = a.text();
  b.errors.length = 0;
  b.ydoc.getText('monaco').insert(0, 'VIEWER SHOULD NOT WRITE\n');
  await wait(800);
  check(
    'server rejects a viewer doc:update',
    b.errors.some((e) => e.code === 'FORBIDDEN'),
    JSON.stringify(b.errors.at(-1)),
  );
  check(
    "viewer's edit never reaches the other peer",
    !a.text().includes('VIEWER SHOULD NOT WRITE'),
    JSON.stringify(a.text().slice(0, 30)),
  );
  check('document on the editor side is unchanged', a.text() === textBeforeViewerEdit);

  b.errors.length = 0;
  b.socket.emit('file:create', { roomId, path: 'viewer-hack.js', type: 'file' });
  await wait(500);
  check('server rejects a viewer file:create', b.errors.some((e) => e.code === 'FORBIDDEN'));
  check('rejected file was not created', !a.files.some((f) => f.path === 'viewer-hack.js'));

  b.errors.length = 0;
  b.socket.emit('doc:save', { roomId, fileId: indexFile.fileId });
  await wait(400);
  check('server rejects a viewer doc:save', b.errors.some((e) => e.code === 'FORBIDDEN'));

  b.errors.length = 0;
  b.socket.emit('room:language', { roomId, fileId: indexFile.fileId, language: 'java' });
  await wait(400);
  check('server rejects a viewer language change', b.errors.some((e) => e.code === 'FORBIDDEN'));

  // Chat stays open to viewers.
  b.socket.emit('chat:send', { roomId, text: 'viewers can still talk' });
  await wait(500);
  check('viewer can still chat', a.chats.some((m) => m.text === 'viewers can still talk'));

  // --- TEST 3: promote back to editor ------------------------------------
  await axios.patch(
    `${API}/rooms/${roomId}/members/${bob.user.id}/role`,
    { role: 'editor' },
    as(alice.token),
  );
  await wait(700);
  check('promotion reaches the session', b.role === 'editor', String(b.role));
  b.errors.length = 0;
  b.ydoc.getText('monaco').insert(0, '// bob can edit again\n');
  await wait(800);
  check('promoted editor can write', a.text().includes('// bob can edit again'));
  check('no error on the promoted edit', b.errors.length === 0, JSON.stringify(b.errors));

  // Non-owner cannot change roles.
  const roleForbidden = await axios
    .patch(`${API}/rooms/${roomId}/members/${alice.user.id}/role`, { role: 'viewer' }, as(bob.token))
    .then(() => null)
    .catch((err) => err.response);
  check('non-owner cannot change roles', roleForbidden?.status === 403, String(roleForbidden?.status));

  const ownerDemote = await axios
    .patch(`${API}/rooms/${roomId}/members/${alice.user.id}/role`, { role: 'viewer' }, as(alice.token))
    .then((res) => res)
    .catch((err) => err.response);
  check('owner cannot demote themselves', ownerDemote?.status === 400, String(ownerDemote?.status));

  // --- TEST 5: share link target ----------------------------------------
  // The invite URL is /room/:roomId — joining by that id is the flow it opens.
  const carolJoin = await axios.post(`${API}/rooms/${roomId}/join`, {}, as(carol.token));
  check('a new user can join through the invite link target', carolJoin.status === 200);
  check(
    'invited user defaults to read-only viewer',
    carolJoin.data.data.room.myRole === 'viewer',
    String(carolJoin.data.data.room.myRole),
  );

  // --- persistence -------------------------------------------------------
  const finalIndexText = a.text();
  a.socket.emit('doc:save', { roomId, fileId: indexFile.fileId });
  await wait(700);

  // --- TEST 6: password protection --------------------------------------
  await axios.patch(
    `${API}/rooms/${roomId}/settings`,
    { password: { enabled: true, value: 'letmein42' } },
    as(alice.token),
  );
  await wait(600);
  check('password state broadcast to the room', a.settings?.passwordEnabled === true);

  const lockedGet = await axios
    .get(`${API}/rooms/${roomId}`, as(carol.token))
    .then(() => null)
    .catch((err) => err.response);
  check(
    'protected room blocks a member without the password',
    lockedGet?.status === 403 && lockedGet?.data?.code === 'PASSWORD_REQUIRED',
    `${lockedGet?.status} ${lockedGet?.data?.code}`,
  );

  const ownerGet = await axios.get(`${API}/rooms/${roomId}`, as(alice.token));
  check('owner is never locked out', ownerGet.status === 200);

  const carolSocket = makeClient(carol.token, roomId, 'carol');
  await wait(600);
  carolSocket.socket.emit('room:join', { roomId });
  await wait(900);
  check(
    'socket join is blocked without the password',
    carolSocket.errors.some((e) => e.code === 'PASSWORD_REQUIRED') && !carolSocket.joined,
    JSON.stringify(carolSocket.errors.at(-1)),
  );

  const wrongPassword = await axios
    .post(`${API}/rooms/${roomId}/unlock`, { password: 'wrong-one' }, as(carol.token))
    .then(() => null)
    .catch((err) => err.response);
  check(
    'wrong password is rejected',
    wrongPassword?.status === 401 && wrongPassword?.data?.code === 'BAD_ROOM_PASSWORD',
    `${wrongPassword?.status} ${wrongPassword?.data?.code}`,
  );

  const unlocked = await axios.post(
    `${API}/rooms/${roomId}/unlock`,
    { password: 'letmein42' },
    as(carol.token),
  );
  check('correct password unlocks the room', unlocked.status === 200);
  check('unlock response never leaks the hash', !JSON.stringify(unlocked.data).includes('$2'));

  carolSocket.errors.length = 0;
  carolSocket.socket.emit('room:join', { roomId });
  await wait(900);
  check('socket join succeeds after unlocking', carolSocket.joined === true);

  await axios.patch(
    `${API}/rooms/${roomId}/settings`,
    { password: { enabled: false } },
    as(alice.token),
  );
  await wait(500);
  const afterDisable = await axios.get(`${API}/rooms/${roomId}`, as(bob.token));
  check(
    'disabling protection restores open access',
    afterDisable.status === 200 && afterDisable.data.data.room.settings.passwordEnabled === false,
  );

  // --- TEST 7: activity log ---------------------------------------------
  const activityRes = await axios.get(`${API}/rooms/${roomId}/activity?limit=100`, as(alice.token));
  const types = activityRes.data.data.activity.map((entry) => entry.type);
  const expected = [
    'USER_JOINED',
    'FILE_CREATED',
    'FILE_RENAMED',
    'FILE_DELETED',
    'CODE_SAVED',
    'ROLE_CHANGED',
    'LANGUAGE_CHANGED',
    'PASSWORD_ENABLED',
    'PASSWORD_DISABLED',
  ];
  expected.forEach((type) => {
    check(`activity records ${type}`, types.includes(type));
  });
  check(
    'activity carries the actor name',
    activityRes.data.data.activity.every((entry) => Boolean(entry.actor?.username)),
  );
  check(
    'activity metadata holds labels, not code',
    activityRes.data.data.activity.every(
      (entry) => JSON.stringify(entry.metadata ?? {}).length < 300,
    ),
  );

  const filesOnly = await axios.get(`${API}/rooms/${roomId}/activity?group=files`, as(alice.token));
  check(
    'activity filter narrows to file events',
    filesOnly.data.data.activity.every((entry) =>
      ['FILE_CREATED', 'FILE_RENAMED', 'FILE_DELETED', 'LANGUAGE_CHANGED', 'CODE_SAVED', 'CODE_RUN'].includes(
        entry.type,
      ),
    ),
  );

  const strangerActivity = await axios
    .get(`${API}/rooms/${roomId}/activity`, as(stranger.token))
    .then(() => null)
    .catch((err) => err.response);
  check('activity is members-only', strangerActivity?.status === 403, String(strangerActivity?.status));

  // --- security: emit into a room this socket never joined ----------------
  await new Promise((resolve) => {
    const other = io(WS, { auth: { token: stranger.token }, transports: ['websocket'] });
    other.on('connect', () => {
      const timer = setTimeout(() => {
        check('rejects events for a room the socket never joined', false, 'no error emitted');
        other.close();
        resolve();
      }, 1500);
      other.on('error', (e) => {
        clearTimeout(timer);
        check('rejects events for a room the socket never joined', e.code === 'NOT_IN_ROOM', e.code);
        other.close();
        resolve();
      });
      other.emit('chat:send', { roomId, text: 'should be blocked' });
    });
  });

  // --- presence cleanup on disconnect ------------------------------------
  carolSocket.socket.close();
  b.socket.close();
  await wait(1200);
  check(
    'peers disappear from presence after disconnect',
    a.members.filter((m) => m.online).length === 1,
    JSON.stringify(a.members.map((m) => `${m.username}:${m.online ? 'on' : 'off'}`)),
  );

  a.socket.close();
  await wait(1500); // last socket out flushes and evicts the in-memory docs

  const persisted = await axios.get(`${API}/rooms/${roomId}`, as(alice.token));
  check(
    'room survives with its file list',
    persisted.data.data.room.files.some((f) => f.path === 'src/index.js'),
  );
  check('password hash never reaches the client', !JSON.stringify(persisted.data).includes('$2'));

  const rejoin = makeClient(alice.token, roomId, 'alice-rejoin');
  rejoin.openFile(indexFile.fileId);
  await wait(600);
  rejoin.socket.emit('room:join', { roomId });
  await wait(1400);
  check(
    'rejoin restores the file document from MongoDB',
    rejoin.text() === finalIndexText,
    JSON.stringify(rejoin.text().slice(0, 40)),
  );

  const history = await axios.get(`${API}/rooms/${roomId}/messages`, as(alice.token));
  check(
    'chat history persisted',
    history.data.data.messages.some((m) => m.text === 'hello from alice'),
  );

  rejoin.socket.close();
  await wait(300);

  console.log(`\n${ok.length} passed, ${fail.length} failed`);
  if (fail.length) {
    console.log('FAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E run crashed:', err.response?.data ?? err.message, err.stack);
  process.exit(1);
});
