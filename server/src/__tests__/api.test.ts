/**
 * Integration tests for authentication and room authorization.
 *
 * The suite calls dropDatabase(), so it is deliberately hard to aim at anything
 * that matters: it uses TEST_MONGODB_URI when set, otherwise MONGODB_URI, and
 * it refuses to start at all when the resolved host is not local. Point
 * TEST_MONGODB_URI at a throwaway/local instance to run tests while MONGODB_URI
 * points at a deployed cluster. The database name is always `codesync_test`,
 * never `codesync`.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { connectTestDb, disconnectTestDb } from './testDb';

const app = createApp();

const userA = { username: 'alice', email: 'alice@example.com', password: 'Password123' };
const userB = { username: 'bob', email: 'bob@example.com', password: 'Password123' };

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

describe('auth', () => {
  it('registers a user and never returns the password', async () => {
    const res = await request(app).post('/api/auth/register').send(userA);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(userA.email);
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send(userA);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a weak password with a validation error', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...userB, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: userA.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe(userA.username);
  });

  it('returns a generic error for a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: 'WrongPassword1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('blocks /me without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user with a session and clears it on logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: userA.email, password: userA.password });

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(userA.email);

    await agent.post('/api/auth/logout');
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  /**
   * The second-device bug: on a browser that blocks the cross-site auth cookie,
   * login returns 200 but no cookie is ever sent back, so the dashboard's first
   * request fails with UNAUTHENTICATED. Login must therefore also hand back the
   * token, and that token alone must authenticate — no cookie involved.
   */
  it('authenticates with the login token alone, without any cookie', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: userA.password });
    expect(login.status).toBe(200);
    expect(typeof login.body.data.token).toBe('string');

    // `request(app)` (not `request.agent`) keeps no cookie jar.
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(userA.email);
  });

  it('accepts a valid Bearer token even when the cookie is stale', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: userA.password });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'codesync_token=not-a-real-jwt')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
  });
});

describe('rooms', () => {
  const agentA = request.agent(app);
  const agentB = request.agent(app);
  let roomId = '';

  beforeAll(async () => {
    await agentA.post('/api/auth/login').send({ email: userA.email, password: userA.password });
    await agentB.post('/api/auth/register').send(userB);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(401);
  });

  it('creates a room with the creator as owner', async () => {
    const res = await agentA.post('/api/rooms').send({ name: 'Test Room' });
    expect(res.status).toBe(201);
    roomId = res.body.data.room.roomId;
    expect(roomId).toMatch(/^[A-Z2-9]{10}$/);
    expect(res.body.data.room.owner.username).toBe(userA.username);
    expect(res.body.data.room.members).toHaveLength(1);
    expect(res.body.data.room.language).toBe('javascript');
  });

  it('rejects an invalid room name', async () => {
    const res = await agentA.post('/api/rooms').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('lists only rooms the user belongs to', async () => {
    const mine = await agentA.get('/api/rooms');
    expect(mine.body.data.rooms).toHaveLength(1);

    const theirs = await agentB.get('/api/rooms');
    expect(theirs.body.data.rooms).toHaveLength(0);
  });

  it('adds a member on join without duplicating', async () => {
    const first = await agentB.post(`/api/rooms/${roomId}/join`);
    expect(first.status).toBe(200);
    expect(first.body.data.joined).toBe(true);

    const second = await agentB.post(`/api/rooms/${roomId}/join`);
    expect(second.body.data.joined).toBe(false);
    expect(second.body.data.room.members).toHaveLength(2);
  });

  it('404s on an unknown room', async () => {
    const res = await agentA.get('/api/rooms/ZZZZZZZZZZ');
    expect(res.status).toBe(404);
  });

  it('rejects a malformed room id', async () => {
    const res = await agentA.get('/api/rooms/not-a-room');
    expect(res.status).toBe(400);
  });

  it('forbids a non-owner from deleting the room', async () => {
    const res = await agentB.delete(`/api/rooms/${roomId}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ROOM_OWNER');
  });

  it('lets the owner delete the room', async () => {
    const res = await agentA.delete(`/api/rooms/${roomId}`);
    expect(res.status).toBe(200);

    const after = await agentA.get(`/api/rooms/${roomId}`);
    expect(after.status).toBe(404);
  });
});

describe('workspace, roles and access', () => {
  const owner = request.agent(app);
  const member = request.agent(app);
  let roomId = '';
  let memberId = '';
  let ownerId = '';

  beforeAll(async () => {
    await owner.post('/api/auth/login').send({ email: userA.email, password: userA.password });
    await member.post('/api/auth/login').send({ email: userB.email, password: userB.password });

    const me = await owner.get('/api/auth/me');
    ownerId = me.body.data.user.id;
    const them = await member.get('/api/auth/me');
    memberId = them.body.data.user.id;

    const created = await owner.post('/api/rooms').send({ name: 'Phase 2 Room' });
    roomId = created.body.data.room.roomId;
    await member.post(`/api/rooms/${roomId}/join`);
  });

  it('creates a workspace with one file and reports the caller role', async () => {
    const res = await owner.get(`/api/rooms/${roomId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.room.files).toHaveLength(1);
    expect(res.body.data.room.files[0].type).toBe('file');
    expect(res.body.data.room.myRole).toBe('owner');
    // Internal fields must never be projected.
    expect(JSON.stringify(res.body)).not.toContain('docState');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('gives a member who joined by ID the read-only viewer role', async () => {
    const res = await member.get(`/api/rooms/${roomId}`);
    expect(res.body.data.room.myRole).toBe('viewer');
  });

  it('lets only the owner change roles', async () => {
    const forbidden = await member
      .patch(`/api/rooms/${roomId}/members/${ownerId}/role`)
      .send({ role: 'viewer' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('NOT_ROOM_OWNER');

    const allowed = await owner
      .patch(`/api/rooms/${roomId}/members/${memberId}/role`)
      .send({ role: 'editor' });
    expect(allowed.status).toBe(200);

    const after = await member.get(`/api/rooms/${roomId}`);
    expect(after.body.data.room.myRole).toBe('editor');
  });

  it('refuses to reassign or remove ownership', async () => {
    const selfDemote = await owner
      .patch(`/api/rooms/${roomId}/members/${ownerId}/role`)
      .send({ role: 'viewer' });
    expect(selfDemote.status).toBe(400);
    expect(selfDemote.body.code).toBe('CANNOT_CHANGE_OWNER');

    const promoteToOwner = await owner
      .patch(`/api/rooms/${roomId}/members/${memberId}/role`)
      .send({ role: 'owner' });
    expect(promoteToOwner.status).toBe(400);
  });

  it('lets only the owner change settings', async () => {
    const forbidden = await member.patch(`/api/rooms/${roomId}/settings`).send({ name: 'Hijacked' });
    expect(forbidden.status).toBe(403);

    const allowed = await owner.patch(`/api/rooms/${roomId}/settings`).send({ name: 'Renamed' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.room.name).toBe('Renamed');
  });

  it('gates a protected room and never leaks the hash', async () => {
    const enabled = await owner
      .patch(`/api/rooms/${roomId}/settings`)
      .send({ password: { enabled: true, value: 'letmein42' } });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.room.settings.passwordEnabled).toBe(true);
    expect(JSON.stringify(enabled.body)).not.toContain('letmein42');
    expect(JSON.stringify(enabled.body)).not.toContain('$2');

    const locked = await member.get(`/api/rooms/${roomId}`);
    expect(locked.status).toBe(403);
    expect(locked.body.code).toBe('PASSWORD_REQUIRED');

    // Chat and activity are room content too: locked behind the same password.
    expect((await member.get(`/api/rooms/${roomId}/messages`)).body.code).toBe('PASSWORD_REQUIRED');
    expect((await member.get(`/api/rooms/${roomId}/activity`)).body.code).toBe('PASSWORD_REQUIRED');

    // A stranger knocking with the ID is not enrolled by the failed attempt.
    const stranger = request.agent(app);
    await stranger
      .post('/api/auth/register')
      .send({ username: 'dave', email: 'dave@example.com', password: 'Password123' });
    expect((await stranger.post(`/api/rooms/${roomId}/join`)).body.code).toBe('PASSWORD_REQUIRED');
    expect((await stranger.get(`/api/rooms/${roomId}/messages`)).body.code).toBe('PASSWORD_REQUIRED');
    expect((await stranger.get(`/api/rooms/${roomId}/activity`)).status).toBe(403);

    // The owner is never locked out of their own room.
    expect((await owner.get(`/api/rooms/${roomId}`)).status).toBe(200);

    const wrong = await member.post(`/api/rooms/${roomId}/unlock`).send({ password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('BAD_ROOM_PASSWORD');

    const right = await member.post(`/api/rooms/${roomId}/unlock`).send({ password: 'letmein42' });
    expect(right.status).toBe(200);
    expect((await member.get(`/api/rooms/${roomId}`)).status).toBe(200);
  });

  it('re-locks everyone when the password changes', async () => {
    await owner
      .patch(`/api/rooms/${roomId}/settings`)
      .send({ password: { enabled: true, value: 'a-new-secret' } });

    const relocked = await member.get(`/api/rooms/${roomId}`);
    expect(relocked.status).toBe(403);
    expect(relocked.body.code).toBe('PASSWORD_REQUIRED');

    await owner.patch(`/api/rooms/${roomId}/settings`).send({ password: { enabled: false } });
    expect((await member.get(`/api/rooms/${roomId}`)).status).toBe(200);
  });

  it('records activity and keeps it to members', async () => {
    const res = await owner.get(`/api/rooms/${roomId}/activity`);
    expect(res.status).toBe(200);
    const types = res.body.data.activity.map((entry: { type: string }) => entry.type);
    expect(types).toContain('ROLE_CHANGED');
    expect(types).toContain('PASSWORD_ENABLED');
    expect(types).toContain('PASSWORD_DISABLED');
    expect(types).toContain('ROOM_SETTINGS_CHANGED');

    const filtered = await owner.get(`/api/rooms/${roomId}/activity?group=settings`);
    expect(
      filtered.body.data.activity.every((entry: { type: string }) =>
        ['ROOM_SETTINGS_CHANGED', 'PASSWORD_ENABLED', 'PASSWORD_DISABLED'].includes(entry.type),
      ),
    ).toBe(true);

    const stranger = request.agent(app);
    await stranger
      .post('/api/auth/register')
      .send({ username: 'erin', email: 'erin@example.com', password: 'Password123' });
    const denied = await stranger.get(`/api/rooms/${roomId}/activity`);
    expect(denied.status).toBe(403);
  });

  it('rejects an invalid role and an empty settings patch', async () => {
    const badRole = await owner
      .patch(`/api/rooms/${roomId}/members/${memberId}/role`)
      .send({ role: 'admin' });
    expect(badRole.status).toBe(400);

    const empty = await owner.patch(`/api/rooms/${roomId}/settings`).send({});
    expect(empty.status).toBe(400);
  });
});
