/**
 * Real-time regression tests: a live HTTP + Socket.IO server against the test
 * database, driven by socket.io-client. Covers the races and data-loss paths
 * that the REST suite cannot reach.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createApp } from '../app';
import { Room } from '../models/Room';
import { createSocketServer } from '../sockets';
import { connectTestDb, disconnectTestDb } from './testDb';

interface FileView {
  fileId: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  language: string;
}

const app = createApp();
const httpServer = http.createServer(app);
const ioServer = createSocketServer(httpServer);
let baseUrl = '';
const sockets: Socket[] = [];

function waitFor<T>(socket: Socket, event: string, match: (payload: T) => boolean = () => true) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, 5_000);
    const handler = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function account(username: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email: `${username}@example.com`, password: 'Password123' });
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

async function client(token: string): Promise<Socket> {
  const socket = connect(baseUrl, { auth: { token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  await waitFor(socket, 'connect');
  return socket;
}

async function join(socket: Socket, roomId: string) {
  const state = waitFor<{ role: string; files: FileView[] }>(socket, 'room:state');
  socket.emit('room:join', { roomId });
  return state;
}

function filesEvent(socket: Socket, match: (files: FileView[]) => boolean) {
  return waitFor<{ files: FileView[] }>(socket, 'room:files', (p) => match(p.files)).then((p) => p.files);
}

let owner: { token: string; id: string };
let guest: { token: string; id: string };
let roomId = '';

beforeAll(async () => {
  await connectTestDb();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  owner = await account('olivia');
  guest = await account('gus');
  const created = await request(app)
    .post('/api/rooms')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ name: 'Socket Room', language: 'javascript' });
  roomId = created.body.data.room.roomId;
});

afterAll(async () => {
  sockets.forEach((socket) => socket.disconnect());
  // Let the server's disconnect handlers (presence, final doc flush) finish
  // before the database goes away underneath them.
  await new Promise((resolve) => setTimeout(resolve, 500));
  ioServer.close();
  await disconnectTestDb();
});

describe('workspace over sockets', () => {
  it('starts a new room with runnable starter code', async () => {
    const room = await Room.findOne({ roomId });
    expect(room!.files[0].name).toBe('main.js');
    expect(room!.files[0].content).toContain('console.log');
  });

  it('keeps every other file’s CRDT state when a file is deleted', async () => {
    const socket = await client(owner.token);
    await join(socket, roomId);

    for (const path of ['keep.js', 'drop.js']) {
      const created = filesEvent(socket, (files) => files.some((f) => f.path === path));
      socket.emit('file:create', { roomId, path });
      await created;
    }
    const files = (await Room.findOne({ roomId }))!.files;
    const keep = files.find((f) => f.path === 'keep.js')!;
    const drop = files.find((f) => f.path === 'drop.js')!;

    // Give keep.js real persisted Yjs state.
    const opened = waitFor(socket, 'file:state');
    socket.emit('file:open', { roomId, fileId: keep.fileId });
    await opened;
    const doc = new Y.Doc();
    doc.getText('monaco').insert(0, 'const kept = true;');
    socket.emit('doc:update', { roomId, fileId: keep.fileId, update: Y.encodeStateAsUpdate(doc) });
    const saved = waitFor(socket, 'doc:saved');
    socket.emit('doc:save', { roomId, fileId: keep.fileId });
    await saved;

    const deleted = filesEvent(socket, (list) => !list.some((f) => f.fileId === drop.fileId));
    socket.emit('file:delete', { roomId, fileId: drop.fileId });
    await deleted;

    const after = await Room.findOne({ roomId }).select('+files.docState');
    const kept = after!.files.find((f) => f.fileId === keep.fileId)!;
    expect(kept.docState?.length ?? 0).toBeGreaterThan(0);
    expect(kept.content).toBe('const kept = true;');
    expect(after!.files.some((f) => f.fileId === drop.fileId)).toBe(false);
  });

  it('renames the extension when the language changes, and refuses a taken name', async () => {
    const socket = await client(owner.token);
    await join(socket, roomId);
    const main = (await Room.findOne({ roomId }))!.files.find((f) => f.path === 'main.js')!;

    const renamed = filesEvent(socket, (files) => files.some((f) => f.path === 'main.py'));
    socket.emit('room:language', { roomId, fileId: main.fileId, language: 'python' });
    const files = await renamed;
    const file = files.find((f) => f.fileId === main.fileId)!;
    expect(file.name).toBe('main.py');
    expect(file.language).toBe('python');

    const taken = filesEvent(socket, (list) => list.some((f) => f.path === 'keep.py'));
    socket.emit('file:create', { roomId, path: 'keep.py' });
    await taken;
    const keep = (await Room.findOne({ roomId }))!.files.find((f) => f.path === 'keep.js')!;
    const refused = waitFor<{ code: string }>(socket, 'error');
    socket.emit('room:language', { roomId, fileId: keep.fileId, language: 'python' });
    expect((await refused).code).toBe('PATH_TAKEN');
  });

  it('survives a language change racing a delete (no VersionError crash)', async () => {
    const socket = await client(owner.token);
    await join(socket, roomId);
    for (const path of ['race-a.js', 'race-b.js']) {
      const created = filesEvent(socket, (files) => files.some((f) => f.path === path));
      socket.emit('file:create', { roomId, path });
      await created;
    }
    const files = (await Room.findOne({ roomId }))!.files;
    const a = files.find((f) => f.path === 'race-a.js')!;
    const b = files.find((f) => f.path === 'race-b.js')!;

    const settled = filesEvent(
      socket,
      (list) => list.some((f) => f.path === 'race-a.ts') && !list.some((f) => f.fileId === b.fileId),
    );
    socket.emit('room:language', { roomId, fileId: a.fileId, language: 'typescript' });
    socket.emit('file:delete', { roomId, fileId: b.fileId });
    await settled;

    // The process is alive and still answering.
    const pong = waitFor(socket, 'session:pong');
    socket.emit('session:ping', { sentAt: Date.now() });
    await pong;
  });

  it('enrols a stranger joining by ID as a read-only viewer', async () => {
    const socket = await client(guest.token);
    const state = await join(socket, roomId);
    expect(state.role).toBe('viewer');

    const refused = waitFor<{ code: string }>(socket, 'error');
    socket.emit('file:create', { roomId, path: 'sneaky.js' });
    expect((await refused).code).toBe('FORBIDDEN');
  });

  it('evicts live members when the owner turns on a password', async () => {
    const socket = await client(guest.token);
    await join(socket, roomId);

    const evicted = waitFor<{ code: string }>(socket, 'error', (p) => p.code === 'PASSWORD_REQUIRED');
    const res = await request(app)
      .patch(`/api/rooms/${roomId}/settings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ password: { enabled: true, value: 'secret-42' } });
    expect(res.status).toBe(200);
    await evicted;

    // Gone from the room: a follow-up action is refused.
    const refused = waitFor<{ code: string }>(socket, 'error', (p) => p.code === 'NOT_IN_ROOM');
    socket.emit('chat:send', { roomId, text: 'still here?' });
    await refused;
  });
});
