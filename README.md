# CodeSync — Real-Time Collaborative Code Editor

A production-minded MERN application where several people edit the same file at
the same time, see each other's cursors, and chat — inspired by VS Code Live
Share and Replit multiplayer.

**Yjs (CRDT) for convergence · Socket.IO for transport · MongoDB for
persistence · Monaco for the editor.**

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Folder structure](#folder-structure)
5. [Database schema](#database-schema)
6. [REST API](#rest-api)
7. [Socket.IO events](#socketio-events)
8. [How real-time sync works](#how-real-time-sync-works)
9. [Authentication flow](#authentication-flow)
10. [Local setup](#local-setup)
11. [Environment variables](#environment-variables)
12. [Running the project](#running-the-project)
13. [Testing](#testing)
14. [Deployment](#deployment)
15. [Screenshots](#screenshots)
16. [Security notes](#security-notes)
17. [Future improvements](#future-improvements)
18. [Interview discussion points](#interview-discussion-points)

---

## Features

**Authentication** — register, login, logout, JWT in an httpOnly cookie,
session rehydration on refresh, protected routes.

**Rooms** — create a room with a shareable public ID, join by ID or invite link,
dashboard of recent rooms with language/member/updated metadata, owner-only
delete.

**Roles** — `owner` / `editor` / `viewer`. Viewers are read-only: they can read
code, switch files, watch output, see cursors and chat, but every mutating
socket event and REST route rejects them **server-side**, so bypassing the UI
changes nothing. The owner changes roles from the collaborators panel and open
sessions flip immediately (no reload).

**Multi-file workspace** — a file tree with folders, create / rename / delete
(context menu or the header buttons), and **one independent `Y.Doc` per file**.
Two people on `src/app.js` collaborate; switching to `src/utils.js` cannot
affect them. Language is derived from the file extension.

**Sharing** — a share dialog with the room ID and a real invite link
(`/room/:roomId`). A signed-out visitor who opens it is sent to login and
returned to that room afterwards.

**Password-protected rooms** — the owner can turn protection on/off. Passwords
are bcrypt-hashed, never returned by any endpoint, never put in a token, and
verified server-side. Changing the password re-locks every member. The owner is
never locked out.

**Activity log** — join/leave, file created/renamed/deleted, language changed,
code saved, code run, role changed, settings/password changes. Streamed live as
`activity:new` and filterable by All / Files / Members / Settings.

**Collaborative editing** — Yjs CRDT over Socket.IO. Concurrent edits at the
same position converge instead of clobbering each other. Remote cursors and
selections are labelled with the collaborator's name and colour.

**Presence** — every room member is listed with a live online/offline dot.
Cleanup is driven by the socket `disconnect` event, so closing a tab works.

**Chat** — real-time messages with server-assigned sender and timestamp,
persisted to MongoDB and reloaded as history.

**Editor** — Monaco with syntax highlighting for 9 languages, a synchronised
language selector, dark/light theme persisted to `localStorage`.

**Run + output** — a Run button executes the room's current code and broadcasts
stdout/stderr/exit code/duration to everyone in the room, with an optional
stdin box. JavaScript, TypeScript, Python, Java and C++ are executable; the
button is disabled for HTML/CSS/JSON/SQL.

**Persistence** — each open file's Yjs state is debounce-saved every 3 s while
someone has it open, flushed when the last viewer of that file leaves, and
restored on rejoin. A plain-text mirror is kept for previews. Rooms created
before the multi-file workspace are migrated on first open: the existing
`docState` becomes `files[0]`, so edit history is moved, not recreated.

**UX** — loading, empty and error states everywhere, plus a live
Connected / Connecting… / Disconnected indicator.

---

## Tech stack

| Layer | Choices |
| --- | --- |
| Frontend | React 18, Vite, TypeScript (strict), Redux Toolkit, React Router 6, Tailwind CSS v4, Axios |
| Editor | Monaco Editor, `@monaco-editor/react`, `y-monaco` |
| Realtime | Socket.IO, Yjs, `y-protocols/awareness` |
| Backend | Node.js, Express 4, TypeScript (strict), Socket.IO, Mongoose 8 |
| Data | MongoDB |
| Security | JWT, bcrypt, Zod, `express-rate-limit`, CORS with credentials |
| Tooling | ESLint, Prettier, Vitest + Supertest, `tsx`, `concurrently` |

---

## Architecture

A **modular monolith**. Express and Socket.IO share a single HTTP server, so
one port, one origin and one JWT cover both protocols.

```
┌────────────────────────── Browser ──────────────────────────┐
│  React + Redux Toolkit                                      │
│                                                             │
│   Monaco ──► y-monaco ──► Y.Doc ──► Socket.IO client        │
│      ▲                      ▲              │                │
│      └── remote cursors ────┘              │                │
│         (Yjs awareness)                    │                │
└────────────── Axios (REST) ────────────────┼────────────────┘
                     │                       │
                     ▼                       ▼
        ┌────────────────────────────────────────────────┐
        │           http.createServer(app)               │
        ├─────────────────────┬──────────────────────────┤
        │  Express API        │  Socket.IO server        │
        │   routes            │   handshake auth (JWT)   │
        │   controllers       │   room join / leave      │
        │   Zod validation    │   presence registry      │
        │   requireAuth       │   Yjs update relay       │
        │   error middleware  │   awareness relay        │
        │                     │   chat                   │
        └─────────┬───────────┴───────────┬──────────────┘
                  │                       │
                  │            in-memory Map<roomId, Y.Doc>
                  │                       │ debounced 3 s
                  ▼                       ▼
              ┌──────────────────────────────────┐
              │  MongoDB (users, rooms, messages)│
              └──────────────────────────────────┘
```

Why a monolith: one deployable, one auth path, no network hop between the API
and the socket layer. Horizontal scaling later needs only the Socket.IO Redis
adapter, not a rewrite.

---

## Folder structure

```
codesync/
├── client/
│   ├── src/
│   │   ├── app/                  store.ts, typed hooks
│   │   ├── components/
│   │   │   ├── chat/             ChatPanel
│   │   │   ├── common/           Button, Input, Alert, Spinner, ThemeToggle, ConnectionBadge
│   │   │   ├── editor/           CodeEditor, LanguageSelect, OutputPanel, RemoteCursorStyles
│   │   │   └── room/             FileTree, CollaboratorsPanel, ActivityPanel,
│   │   │                         ShareModal, RoomSettingsModal, PasswordGate, RoomTable
│   │   ├── features/
│   │   │   ├── auth/             authSlice (+ thunks)
│   │   │   ├── chat/             chatSlice
│   │   │   ├── editor/           useCollabSession  ← the CRDT session hook
│   │   │   ├── presence/         presenceSlice
│   │   │   ├── rooms/            roomsSlice (list), roomSlice (current room)
│   │   │   └── ui/               uiSlice (theme)
│   │   ├── layouts/              AppShell
│   │   ├── pages/                Login, Register, Dashboard, Room, NotFound
│   │   ├── routes/               ProtectedRoute, PublicOnlyRoute
│   │   ├── services/             api.ts (axios), socket.ts (single socket), monaco.ts (workers)
│   │   ├── types/                shared DTO types
│   │   ├── utils/                languages.ts, format.ts
│   │   ├── App.tsx  main.tsx  index.css
│   ├── scripts/                  collab-check.mjs (Socket.IO/Yjs/roles/files/password
│   │                             end-to-end), run-check.mjs (code execution)
│   ├── index.html  vite.config.ts  tsconfig*.json  .env.example
│
├── server/
│   ├── src/
│   │   ├── config/               env.ts (Zod-validated), db.ts
│   │   ├── models/               User.ts, Room.ts (members + files + password),
│   │   │                         Message.ts, ActivityLog.ts
│   │   ├── controllers/          auth.controller.ts, room.controller.ts
│   │   ├── routes/               auth.routes.ts, room.routes.ts
│   │   ├── middleware/           auth, error, validate, rateLimit
│   │   ├── services/             runner.ts + localRunner/pistonRunner, activity.ts,
│   │   │                         roomViews.ts (DTO projections)
│   │   ├── sockets/              index.ts, auth.ts, presence.ts, editor.ts, files.ts,
│   │   │                         chat.ts, run.ts, docStore.ts (per-file Y.Doc lifecycle),
│   │   │                         guards.ts (join + role checks), io.ts (server handle)
│   │   ├── validation/schemas.ts Zod schemas for REST *and* socket payloads
│   │   ├── utils/                jwt.ts, roomId.ts, filePath.ts, ApiError.ts,
│   │   │                         asyncHandler.ts, languages.ts
│   │   ├── types/                express.d.ts, socket.types.ts
│   │   ├── __tests__/            api.test.ts (auth + room authorization)
│   │   ├── app.ts                Express app only
│   │   └── server.ts             http server + Socket.IO + graceful shutdown
│   ├── tsconfig.json  vitest.config.ts  .env.example
│
├── eslint.config.mjs  .prettierrc  .gitignore  package.json  README.md
```

---

## Database schema

### User

| Field | Type | Notes |
| --- | --- | --- |
| `username` | String | required, 3–30 chars, trimmed |
| `email` | String | required, unique, lowercase, **indexed** |
| `password` | String | required, min 8, bcrypt cost 12, `select: false` |
| `createdAt` / `updatedAt` | Date | timestamps |

`pre('save')` hashes the password only when modified.
`comparePassword()` wraps `bcrypt.compare`.

### Room

| Field | Type | Notes |
| --- | --- | --- |
| `roomId` | String | public join code, unique, **indexed** — never `_id` |
| `name` | String | required, max 60 |
| `owner` | ObjectId → User | **indexed** |
| `members[]` | `{ user, role, lastSeenAt, passwordOkAt? }` | role ∈ `owner \| editor \| viewer`; `passwordOkAt` records that this member cleared the current room password |
| `files[]` | `{ fileId, name, path, type, language, content, docState, createdAt, updatedAt }` | the workspace; `type ∈ file \| folder`, `path` unique per room, `files.docState` is `select: false` |
| `language` | String | default `javascript`, also the dashboard/runner default |
| `content` | String | plain-text mirror of the most recently saved file (previews) |
| `docState` | Buffer | legacy single-buffer state, `select: false` — migrated into `files[0]` on first open |
| `isPublic` | Boolean | default `true` |
| `passwordEnabled` | Boolean | default `false` |
| `passwordHash` | String | bcrypt, `select: false`, never projected to a client |

Compound index: `{ 'members.user': 1, updatedAt: -1 }` — powers "my recent rooms".

### ActivityLog

| Field | Type | Notes |
| --- | --- | --- |
| `room` | ObjectId → Room | **indexed** |
| `actor` | ObjectId → User | set from the session, never the payload |
| `type` | String | enum: `USER_JOINED`, `USER_LEFT`, `FILE_CREATED`, `FILE_RENAMED`, `FILE_DELETED`, `LANGUAGE_CHANGED`, `CODE_SAVED`, `CODE_RUN`, `ROLE_CHANGED`, `ROOM_SETTINGS_CHANGED`, `PASSWORD_ENABLED`, `PASSWORD_DISABLED` |
| `metadata` | Mixed | small labels only (path, role, language) — never code content |

Compound index: `{ room: 1, createdAt: -1 }` — powers the activity panel.

### Message

| Field | Type | Notes |
| --- | --- | --- |
| `room` | ObjectId → Room | **indexed** |
| `sender` | ObjectId → User | set from the socket session, never the payload |
| `text` | String | required, trimmed, max 2000 |

Compound index: `{ room: 1, createdAt: -1 }` — powers paged history.

---

## REST API

Base URL `http://localhost:5000/api`. 🔒 = requires the auth cookie.

Every response uses one of two shapes:

```jsonc
// success
{ "success": true, "data": { /* ... */ } }

// failure
{ "success": false, "message": "Invalid credentials", "code": "INVALID_CREDENTIALS" }
```

### Auth

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ username, email, password }` | `201` `{ user }` + `Set-Cookie` |
| POST | `/auth/login` | `{ email, password }` | `200` `{ user }` + `Set-Cookie` |
| GET | `/auth/me` 🔒 | — | `200` `{ user }` |
| POST | `/auth/logout` | — | `200` `{ loggedOut: true }` |

`/auth/register` and `/auth/login` are rate-limited to **5 requests/minute**.

<details>
<summary>Examples</summary>

```http
POST /api/auth/register
Content-Type: application/json

{ "username": "ada", "email": "ada@example.com", "password": "Password123" }
```

```jsonc
201 Created
{
  "success": true,
  "data": {
    "user": {
      "id": "6a7adc0797b4ebcfae01ec7a",
      "username": "ada",
      "email": "ada@example.com",
      "createdAt": "2026-08-11T13:50:54.000Z"
    }
  }
}
```

```jsonc
// wrong password, or unknown email — deliberately identical
401 Unauthorized
{ "success": false, "message": "Invalid credentials", "code": "INVALID_CREDENTIALS" }
```
</details>

### Rooms — all 🔒

| Method | Path | Body / Query | Notes |
| --- | --- | --- | --- |
| POST | `/rooms` | `{ name, language?, isPublic? }` | caller becomes `owner` |
| GET | `/rooms` | — | rooms the caller belongs to, `updatedAt` desc, no document body |
| GET | `/rooms/:roomId` | — | `403` if private and not a member |
| POST | `/rooms/:roomId/join` | — | idempotent; `{ room, joined }`; `403 PASSWORD_REQUIRED` if protected |
| POST | `/rooms/:roomId/unlock` | `{ password }` | verifies the room password (10/min limiter), stamps the member, returns the room |
| PATCH | `/rooms/:roomId/settings` | `{ name?, isPublic?, password?: { enabled, value? } }` | **owner only** |
| PATCH | `/rooms/:roomId/members/:userId/role` | `{ role: "editor" \| "viewer" }` | **owner only**; ownership cannot be reassigned or self-demoted |
| GET | `/rooms/:roomId/activity` | `?group=all\|files\|members\|settings&limit=1..100` | members only, newest-first |
| DELETE | `/rooms/:roomId` | — | owner only, cascades to messages and activity |
| GET | `/rooms/:roomId/messages` | `?before=<iso>&limit=1..100` | newest-first |

<details>
<summary>Example — create room</summary>

```jsonc
201 Created
{
  "success": true,
  "data": {
    "room": {
      "roomId": "RCMNVRJLK4",
      "name": "Interview prep",
      "owner": { "id": "6a7a…", "username": "ada" },
      "members": [{ "user": { "id": "6a7a…", "username": "ada" }, "role": "owner", "lastSeenAt": "…" }],
      "memberCount": 1,
      "language": "javascript",
      "files": [
        { "fileId": "9f2c…", "name": "main.js", "path": "main.js", "type": "file", "language": "javascript", "updatedAt": "…" }
      ],
      "settings": { "name": "Interview prep", "isPublic": true, "passwordEnabled": false },
      "myRole": "owner",
      "isPublic": true,
      "createdAt": "…", "updatedAt": "…"
    }
  }
}
```

File bodies are never in this payload — they are fetched per file over the
socket (`file:open` → `file:state`).
</details>

### Error codes

`VALIDATION_ERROR` · `UNAUTHENTICATED` · `TOKEN_INVALID` · `INVALID_CREDENTIALS`
· `EMAIL_TAKEN` · `ROOM_NOT_FOUND` · `ROOM_PRIVATE` · `NOT_ROOM_OWNER`
· `NOT_A_MEMBER` · `CANNOT_CHANGE_OWNER` · `PASSWORD_REQUIRED`
· `BAD_ROOM_PASSWORD` · `RATE_LIMITED` · `ROUTE_NOT_FOUND` · `INTERNAL_ERROR`

Socket-only codes: `NOT_IN_ROOM` · `FORBIDDEN` · `FILE_NOT_FOUND` ·
`FILE_NOT_OPEN` · `PATH_TAKEN` · `BAD_PATH` · `LAST_FILE` · `TOO_MANY_FILES` ·
`ROOM_INACTIVE` · `BAD_PAYLOAD` · `LANGUAGE_NOT_RUNNABLE`

---

## Socket.IO events

The handshake is authenticated from the same JWT cookie (or
`auth: { token }` for non-browser clients). Unauthenticated handshakes are
rejected with `UNAUTHENTICATED` before any event handler is registered.

### Client → server

| Event | Payload | Server behaviour |
| --- | --- | --- |
Role column: **W** = owner/editor only (write access), **M** = any member.

| Event | Payload | Role | Server behaviour |
| --- | --- | --- | --- |
| `room:join` | `{ roomId }` | M | verifies the room exists, membership and the room password, caches the caller's role, joins the Socket.IO room, replies with `room:state`, broadcasts `room:members` |
| `room:leave` | `{ roomId }` | M | leaves, drops presence, closes the open file |
| `file:open` | `{ roomId, fileId }` | M | joins the `roomId::fileId` stream, loads that file's `Y.Doc`, replies with `file:state`; re-opening the same file is a **resync** request |
| `file:create` | `{ roomId, path, type? }` | W | validates the path, creates missing parent folders, broadcasts `room:files` + `activity:new` |
| `file:rename` | `{ roomId, fileId, name }` | W | renames, moves descendants for a folder, re-derives the language |
| `file:delete` | `{ roomId, fileId }` | W | deletes the entry (and its subtree), moves anyone inside it to a surviving file; refuses to delete the last file |
| `doc:update` | `{ roomId, fileId, update: Uint8Array }` | W | applies to that file's server `Y.Doc`, relays to the other sockets **on that file** |
| `awareness:update` | `{ roomId, fileId, update: Uint8Array }` | M | relayed only — cursors are never persisted (viewers may publish a cursor) |
| `room:language` | `{ roomId, fileId, language }` | W | validated against the supported list, persisted on the file, broadcast |
| `chat:send` | `{ roomId, text }` | M | validated, rate-limited, stored, broadcast (viewers can chat) |
| `doc:save` | `{ roomId, fileId }` | W | forces a flush of that file to MongoDB |
| `code:run` | `{ roomId, fileId, stdin? }` | W | executes that file's **server-side** document, broadcasts the result; 5 runs/min per socket |

### Server → client

| Event | Payload |
| --- | --- |
| `room:state` | `{ roomId, name, language, role, files, settings }` |
| `room:members` | `{ roomId, members: [{ userId, username, role, online }] }` |
| `room:files` | `{ roomId, files: [{ fileId, name, path, type, language, updatedAt }] }` |
| `room:settings` | `{ roomId, settings: { name, isPublic, passwordEnabled } }` |
| `room:role` | `{ roomId, role }` — sent to the affected user when an owner changes it |
| `file:state` | `{ roomId, fileId, language, docState }` — full `Y.encodeStateAsUpdate` for that file |
| `doc:update` | `{ roomId, fileId, update }` |
| `awareness:update` | `{ roomId, fileId, update }` |
| `room:language` | `{ roomId, fileId, language, by }` |
| `chat:message` | `{ id, roomId, text, sender: { id, username }, createdAt }` |
| `doc:saved` | `{ roomId, fileId, savedAt }` |
| `activity:new` | `{ id, roomId, type, actor: { id, username }, metadata, createdAt }` |
| `code:running` | `{ roomId, by, language }` |
| `code:output` | `{ roomId, by, language, runtime, stdout, stderr, exitCode, durationMs, ranAt }` |
| `code:failed` | `{ roomId, code, message }` |
| `error` | `{ code, message }` |

### Socket authorization rules

Every room-scoped event re-checks that the socket is in `socket.data.rooms` —
the set of rooms whose membership **and password** were verified during
`room:join`. A client that emits into a room it never joined receives
`{ code: "NOT_IN_ROOM" }` and nothing is broadcast.

Mutating events additionally check `socket.data.roles.get(roomId)`, a
server-side cache filled at join time and refreshed by the owner's role change
(`room:role`). A viewer that emits `doc:update`, `doc:save`, `file:*`,
`room:language` or `code:run` gets `{ code: "FORBIDDEN" }` — the client's
read-only editor is a courtesy, not the enforcement. Editing events also verify
the file is the one this socket actually opened (`FILE_NOT_OPEN`).

Sender identity, timestamps and roles always come from `socket.data`, never from
the payload. Payloads are Zod-validated, `doc:update` is capped at 512 KB, and
`maxHttpBufferSize` is 1 MB.

---

## How real-time sync works

### Why Yjs instead of OT or last-write-wins

Broadcasting Monaco's `contentChanges` and applying them blindly is the classic
portfolio-project failure: two people typing on the same line produce
interleaved deltas with stale offsets, and the buffer silently corrupts. A
naive full-document last-write-wins is worse — it drops keystrokes under any
real concurrency.

Writing a correct OT engine is weeks of work. Yjs is a battle-tested CRDT that
guarantees convergence with **less** glue code than a hand-rolled
last-write-wins would need, and `y-monaco` + `y-protocols/awareness` bring the
Monaco binding and the remote-cursor protocol along with it.

Crucially, **the `y-websocket` server is not used**. The backend owns the
transport: opaque `Uint8Array` updates travel through our own authenticated,
room-scoped Socket.IO handlers.

```
Division of labour
  Yjs       → conflict resolution (CRDT)
  Socket.IO → transport + authentication + room scoping
  MongoDB   → persistence
  Monaco    → the editor surface
```

### One document per file

The unit of collaboration is a **file**, not a room:

```
Room
 ├── src/index.js  ↔ Y.Doc  ↔ socket stream  roomId::fileId-A
 ├── src/utils.js  ↔ Y.Doc  ↔ socket stream  roomId::fileId-B
 └── README.md     ↔ Y.Doc  ↔ socket stream  roomId::fileId-C
```

Each file gets its own `Y.Doc` on the client *and* on the server, keyed
`roomId::fileId`, refcounted by how many sockets have it open. Updates are
broadcast to the Socket.IO room `roomId::fileId`, so editing `utils.js` sends
nothing to the people looking at `index.js` — and a stray update can never be
applied to the wrong buffer.

### The flow

1. `room:join` — verifies membership, the room password and caches the caller's
   role; replies with `room:state` (files, role, settings). No file body yet.
2. `file:open` — the server loads that file's `docState` into an in-memory
   `Y.Doc` and replies with `file:state` (full `Y.encodeStateAsUpdate`).
3. The client applies it with the origin tag `'remote'`.
4. Local typing → `ydoc.on('update')` fires with a non-`'remote'` origin →
   emitted as `doc:update` with the `fileId`.
5. The server checks the role, applies the update to its own `Y.Doc` for that
   file (keeping the persisted copy authoritative) and relays the identical
   bytes to the other sockets on that file.
6. Peers apply with origin `'remote'`, which the update handler ignores — this
   is what prevents the infinite echo loop.
7. Awareness updates carry cursor, selection, name and colour, scoped to the
   same file stream. They are relayed but never stored. Each client
   re-announces itself when `room:members` changes, so a newcomer sees existing
   cursors immediately.
8. Persistence: a dirty file document is written every 3 s; the last socket to
   close it forces a final flush and it is evicted from memory.
   `SIGINT`/`SIGTERM` flush everything before exit.

### Reconnect and offline edits

While the socket is down the client keeps typing into its local `Y.Doc` but
stops emitting (a buffered `doc:update` would arrive before the rejoin and be
rejected). On reconnect the sequence is `room:join` → `file:open` →
`file:state`, and the client then computes

```ts
Y.encodeStateAsUpdate(ydoc, Y.encodeStateVectorFromUpdate(serverState))
```

— exactly the items the server has not seen — and sends that single diff. Both
sides converge; nothing typed offline is lost. The same path runs when an owner
promotes a viewer, which is why a freshly promoted editor's session recovers
without a reload.

Remote selections are rendered by `y-monaco`, which tags them
`yRemoteSelection-<clientID>`. `RemoteCursorStyles` generates the matching
colour/name rules from awareness state at runtime.

---

## Code execution (the Run button)

The client sends only `{ roomId, fileId, stdin }`. **The source comes from the
server's own `Y.Doc` for that file**, so everyone runs exactly what is on screen
and no client can smuggle in different code than its collaborators can see. The
language is the file's language. The result is broadcast to the whole room, not
just the person who pressed Run — viewers watch the output but cannot trigger a
run.

`RUNNER` picks the backend:

| Mode | Behaviour | Use when |
| --- | --- | --- |
| `local` *(default)* | spawns a child process on this host in a temp dir | developing on your own machine |
| `piston` | POSTs to a Piston sandbox at `PISTON_URL` | anything publicly reachable |
| `disabled` | Run reports that execution is off | you don't want the feature |

> **`local` is refused when `NODE_ENV=production`.** Running submitted code on
> the host is remote code execution by design; that is acceptable on a laptop
> and not acceptable on a deployed server. If you deploy CodeSync, run
> [Piston](https://github.com/engineer-man/piston) in Docker and set
> `RUNNER=piston` with `PISTON_URL` pointing at it. The free public Piston
> instance became whitelist-only in February 2026, so it is not a working
> default.

Local mode uses whatever is already installed and reports precisely what is
missing otherwise:

| Language | Command | Needs |
| --- | --- | --- |
| JavaScript | `node main.js` | Node.js (always present) |
| TypeScript | `node main.ts` | Node.js 23+ (native type stripping) |
| Python | `python3` / `python main.py` | Python 3 on PATH |
| Java | `java Main.java` | JDK 11+ (single-file source launch) |
| C++ | `g++ main.cpp` then the binary | `g++`, `c++` or `clang++` on PATH |

Guards on local execution: 8 s wall-clock timeout with `SIGKILL`, 20 000-char
output cap, throwaway temp directory removed in a `finally`, `shell: false` so
nothing in the source is shell-interpreted, a near-empty environment (`PATH`
only) so the program cannot read your secrets, 5 runs/min per socket, and temp
paths scrubbed from stack traces so the server's OS username is not leaked to
the room.

---

## Authentication flow

```
Register / Login
      ↓
bcrypt (cost 12) verify → JWT signed with { sub: userId }
      ↓
Set-Cookie: httpOnly, sameSite, secure in production
      ↓
App boot → GET /api/auth/me → authenticated? dashboard : login
      ↓
Socket.IO handshake reads the same cookie → socket.data.user
```

The token lives in an httpOnly cookie rather than `localStorage`, so XSS cannot
read it. Axios uses `withCredentials: true`; CORS is locked to `CLIENT_URL`
with `credentials: true` on both Express and Socket.IO.

---

## Local setup

> Setting this up on a fresh machine for the first time? **[SETUP.md](SETUP.md)**
> is a click-by-click walkthrough including MongoDB Atlas signup, the `.env`
> files, and a test checklist. The section below is the short version.

**Prerequisites:** Node.js 20+, npm, and a MongoDB instance (local or Atlas).

```bash
git clone <your-fork-url> codesync
cd codesync

# root tooling (concurrently, eslint, prettier)
npm install

# backend + frontend
npm install --prefix server
npm install --prefix client
```

Or in one step after the root install: `npm run install:all`.

### Database setup

No migrations or seed data are needed — Mongoose creates the collections and
indexes on first write.

- **Local:** install MongoDB Community, make sure `mongod` is running, and use
  `mongodb://127.0.0.1:27017/codesync`.
- **Atlas:** create a free cluster, add a database user, allow your IP, and copy
  the `mongodb+srv://…` string. Append a database name, e.g. `…/codesync`.

---

## Environment variables

Copy both example files and fill in the two values marked **YOU MUST PROVIDE**.

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env`

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING   # ← you provide
JWT_SECRET=YOUR_LONG_RANDOM_SECRET           # ← you provide (min 16 chars)
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
# TEST_MONGODB_URI=mongodb://127.0.0.1:27017/codesync   # optional, see Testing
RUNNER=local                                 # local | piston | disabled
PISTON_URL=https://emkc.org/api/v2/piston    # only used when RUNNER=piston
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`client/.env`

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

The server validates its environment with Zod at boot and **exits with a clear
message** rather than starting half-configured. `.env` is git-ignored; only the
`.env.example` files are committed.

`VITE_*` variables are inlined into the frontend bundle at build time and are
public. Never put a secret in one — `MONGODB_URI` and `JWT_SECRET` belong in
`server/.env` only, and the frontend never receives them.

**Production is validated more strictly.** With `NODE_ENV=production` the server
refuses to boot when `MONGODB_URI` points at localhost or still holds a
placeholder, when `CLIENT_URL` is unset, localhost, or not `https://`, or when
`JWT_SECRET` is a placeholder or shorter than 32 characters. A deployed instance
can therefore never inherit a development default:

```text
Invalid environment configuration:
  - MONGODB_URI: must point at the deployed database, not localhost
  - JWT_SECRET: must be a fresh random value of at least 32 characters
```

---

## Running the project

```bash
npm run dev        # server (:5000) + client (:5173) together
npm run server     # backend only
npm run client     # frontend only
npm run build      # tsc + vite production build
npm start          # run the compiled backend
npm run lint       # ESLint over both packages
npm run format     # Prettier
```

Open <http://localhost:5173>, register, create a room, and share the room ID.

---

## Testing

### Automated backend tests

```bash
npm test           # from the repo root, or: npm --prefix server run test
```

25 Vitest + Supertest integration tests. Auth and rooms: registration,
duplicate email, weak passwords, login, invalid login, `/me`, logout, room
creation, room listing isolation, idempotent join, unknown/malformed room IDs,
owner-only delete. Workspace and access: the one-file workspace and `myRole` in
the DTO, no `docState`/`passwordHash` in any response, owner-only role changes,
refusal to reassign or self-demote ownership, owner-only settings, the
password gate (wrong → `401`, right → `200`, owner never locked out), re-locking
every member when the password changes, activity recording and its
members-only rule, and rejection of an invalid role or empty settings patch.

> **Destructive-test safety.** The suite calls `dropDatabase()`, so it always
> uses the database name `codesync_test` (never `codesync`) and **refuses to run
> at all** when `MONGODB_URI` is not a local instance:
>
> ```text
> Refusing to run destructive tests: MONGODB_URI is not a local instance and
> TEST_MONGODB_URI is not set.
> ```
>
> Once `MONGODB_URI` points at Atlas, set `TEST_MONGODB_URI` to a local or
> throwaway instance to run tests. A deployed database can never be dropped by
> the test suite.

### Automated real-time check

With the backend running:

```bash
npm --prefix client run check:collab
```

`client/scripts/collab-check.mjs` drives three headless Yjs clients (mirroring
the real client's session logic) and asserts **77** behaviours end to end:
handshake rejection, join, per-file `file:state`, presence, concurrent editing
(different offsets *and* the same offset), awareness, language sync, chat,
offline-edit replay across a reconnect, folder auto-creation, duplicate-path
refusal, two files edited independently, file switching, rename/delete, viewer
read-only enforcement on `doc:update` / `file:create` / `doc:save` /
`room:language`, viewer chat still working, promotion back to editor, owner-only
role changes, self-demotion refusal, invite-link joins, the password gate over
both REST and sockets, activity types and filters, activity being members-only,
room scoping, presence cleanup, and per-file persistence across a rejoin.

```
PASS  both clients received file:state
PASS  concurrent edits converge — "// alice\nconst answer = 42;\n// bob\n"
PASS  same-offset concurrent inserts converge — "AB// alice\nc"
PASS  offline edit reaches the other peer after reconnect
PASS  index.js content is not polluted by utils.js — "export const index = 1;\n"
PASS  server rejects a viewer doc:update — {"code":"FORBIDDEN",…}
PASS  viewer's edit never reaches the other peer
PASS  promoted editor can write
PASS  owner cannot demote themselves — 400
PASS  socket join is blocked without the password — PASSWORD_REQUIRED
PASS  correct password unlocks the room
PASS  activity records ROLE_CHANGED
PASS  rejoin restores the file document from MongoDB

77 passed, 0 failed
```

### Automated code-execution check

```bash
npm --prefix client run check:run
```

Covers stdin/stdout, a runtime error landing in stderr with a non-zero exit
code, an infinite loop killed by the timeout, language dispatch, refusal of a
non-runnable language, and room-scope enforcement on `code:run`:

```
PASS  code:running broadcast before execution
PASS  code:output received
PASS  stdout is correct — "hello codesync\r\n1024\r\n"
PASS  exit code is 0
PASS  runtime reported — python (local)
PASS  runtime error captured in stderr
PASS  non-zero exit code
PASS  javascript runs — "js works 2,4,6"
PASS  infinite loop is terminated by the timeout
PASS  non-runnable language refused — LANGUAGE_NOT_RUNNABLE
PASS  code:run rejected for a room never joined — NOT_IN_ROOM
```

### Postman guide

1. Create an environment with `baseUrl = http://localhost:5000/api`.
2. Enable cookie storage (Postman keeps `codesync_token` automatically).

| # | Request | Expected |
| --- | --- | --- |
| 1 | `POST {{baseUrl}}/auth/register` with `{ username, email, password }` | `201`, no password in the body, `Set-Cookie` present |
| 2 | repeat request 1 | `409 EMAIL_TAKEN` |
| 3 | `POST /auth/register` with a 5-char password | `400 VALIDATION_ERROR` |
| 4 | `POST /auth/login` correct credentials | `200` + cookie |
| 5 | `POST /auth/login` wrong password | `401 INVALID_CREDENTIALS` |
| 6 | `GET /auth/me` | `200` with the user |
| 7 | `POST /auth/logout` then `GET /auth/me` | `200`, then `401` |
| 8 | `POST /rooms` `{ "name": "Test Room" }` | `201`, save `roomId` |
| 9 | `GET /rooms` | your room only |
| 10 | `POST /rooms/{{roomId}}/join` (second account) | `200`, `joined: true`; repeat → `joined: false`, still 2 members |
| 11 | `GET /rooms/ZZZZZZZZZZ` | `404 ROOM_NOT_FOUND` |
| 12 | `GET /rooms/not-a-room` | `400 VALIDATION_ERROR` |
| 13 | `PATCH /rooms/{{roomId}}/members/{{userId}}/role` `{ "role": "viewer" }` as the non-owner | `403 NOT_ROOM_OWNER` |
| 14 | same request as the owner | `200`; the target's session receives `room:role` |
| 15 | `PATCH /rooms/{{roomId}}/members/{{ownerId}}/role` as the owner | `400 CANNOT_CHANGE_OWNER` |
| 16 | `PATCH /rooms/{{roomId}}/settings` `{ "password": { "enabled": true, "value": "letmein42" } }` | `200`, `passwordEnabled: true`, no hash in the body |
| 17 | `GET /rooms/{{roomId}}` as the other member | `403 PASSWORD_REQUIRED` |
| 18 | `POST /rooms/{{roomId}}/unlock` `{ "password": "wrong" }` | `401 BAD_ROOM_PASSWORD` |
| 19 | `POST /rooms/{{roomId}}/unlock` `{ "password": "letmein42" }` then `GET /rooms/{{roomId}}` | `200`, `200` |
| 20 | `GET /rooms/{{roomId}}/activity?group=settings` | `PASSWORD_ENABLED` present |
| 21 | `GET /rooms/{{roomId}}/activity` as a non-member | `403 NOT_A_MEMBER` |
| 22 | `DELETE /rooms/{{roomId}}` as the non-owner | `403 NOT_ROOM_OWNER` |
| 23 | `DELETE /rooms/{{roomId}}` as the owner | `200`, then `GET` → `404` |
| 24 | Any `/rooms` request with cookies cleared | `401` |

### Manual two-browser test

1. Tab A (normal window): register, create a room, open **Share** and copy the
   invite link.
2. Tab B (incognito window): paste the invite link → it lands on login →
   register a second account → you arrive in that room.
3. Both users appear in **Collaborators** with green dots and role badges.
4. Type in A → it appears in B instantly, and vice versa.
5. Each side sees the other's cursor with a coloured name label.
6. Create `src/a.js` and `src/b.js` in A. Open `a.js` in A and `b.js` in B, type
   in both → neither buffer bleeds into the other. Open `a.js` in B → its own
   content loads and both sides collaborate again.
7. In A (owner), click B's role badge → **Viewer**. B's editor becomes read-only
   immediately, the banner appears, and typing does nothing. Switch back to
   **Editor** → B can type again.
8. Owner → gear icon → enable a password. Open the room in a third browser →
   the password gate appears; a wrong password is refused, the right one enters.
9. Watch the **Activity** panel through all of the above — join, file create,
   rename, role change, password enable all appear with the actor's name.
10. Send a chat message from A → B receives it (a viewer can chat too).
11. Close tab B → B flips to an offline dot in A.
12. Close both tabs, reopen the room → every file's code is restored from
    MongoDB.

---

## Deployment

```text
        Browser (React + Monaco)
                 │  HTTPS + WSS
                 ▼
   Backend: Express + Socket.IO + JWT      ← Node service, one port
                 │  Mongoose
                 ▼
        MongoDB Atlas · database: codesync
```

Two deployable artefacts: a **Node service** (the backend, which serves both the
REST API and the Socket.IO endpoint on one port) and a **static `dist/` folder**
(the frontend). No Docker required.

### 1. MongoDB Atlas

1. Create an M0 cluster and a database user with `readWrite` on `codesync`.
2. Network Access → allow your backend's egress IP (`0.0.0.0/0` is acceptable
   for a portfolio deploy).
3. Copy the driver connection string and **append the database name** before the
   query string, percent-encoding any special characters in the password:

   ```text
   mongodb+srv://USER:PASSWORD@CLUSTER.xxxxx.mongodb.net/codesync?retryWrites=true&w=majority
   ```

   Without `/codesync` the driver silently uses `test`.

Indexes are declared in the schemas and created by Mongoose on first connect:
`users.email` (unique), `rooms.roomId` (unique), `rooms.owner`,
`rooms.{members.user, updatedAt}`, `messages.{room, createdAt}`,
`activitylogs.{room, createdAt}`.

### 2. Backend

Build and start commands:

```bash
npm install          # or: npm ci
npm run build        # tsc -> dist/
npm start            # node dist/server.js
```

Set these environment variables **on the platform** (never commit them):

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` — enables strict validation, `Secure`/`SameSite=None` cookies, HSTS, and disables the local runner |
| `PORT` | injected by most platforms; the server reads it and never hardcodes one |
| `MONGODB_URI` | the Atlas string above |
| `JWT_SECRET` | fresh 32+ char random value, not the dev one |
| `JWT_EXPIRES_IN` | optional, defaults to `7d` |
| `CLIENT_URL` | the deployed frontend origin, `https://…`, no trailing slash |
| `RUNNER` | `piston` with a sandbox, or `disabled` — see below |
| `PISTON_URL` | only when `RUNNER=piston` |

Health probe for the platform: `GET /health` (also `GET /api/health`)

```json
{ "status": "ok", "database": "connected", "db": "codesync", "uptime": 42 }
```

It returns `503` with `"database": "disconnected"` when Mongo is unreachable, and
never exposes the connection string.

### 3. Frontend

```bash
npm install
npm run build        # -> client/dist
```

`VITE_API_URL` and `VITE_SOCKET_URL` are read at **build** time, so they must be
set in the build environment:

```env
VITE_API_URL=https://your-backend.example.com/api
VITE_SOCKET_URL=https://your-backend.example.com
```

The localhost defaults live inside an `import.meta.env.DEV` branch and are
stripped from production bundles, so a deployed build can never point at a
developer's machine. If a variable is missing the app falls back to its own
origin and logs which one was not set.

Serve `client/dist` as a static site with an **SPA fallback**, or `/dashboard`,
`/room/:roomId` and share links will 404 on refresh:

- Netlify / Render static: `client/public/_redirects` is committed and ships in
  `dist` — nothing else to do.
- Vercel: add `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
  to `vercel.json`.
- Nginx: `try_files $uri /index.html;`

### 4. CORS, cookies and WSS

`CLIENT_URL` is the single allowed origin for both Express CORS and the
Socket.IO handshake — never `*`, because the API is cookie-authenticated. The
auth cookie is `httpOnly` always, and `Secure` + `SameSite=None` when
`NODE_ENV=production`, which is what lets a frontend on one HTTPS domain
authenticate against a backend on another. Both therefore **must** be HTTPS in
production; the server enforces that `CLIENT_URL` starts with `https://`.

Socket.IO needs no separate host or port: the client connects to
`VITE_SOCKET_URL` and upgrades to `wss://` automatically. `app.set('trust proxy', 1)`
is already configured so platform proxies do not break secure cookies or the
rate limiter's client-IP detection.

### 5. Code execution in production

`RUNNER=local` spawns child processes on the host — fine on a laptop, an arbitrary
code execution hole on a public server. It is therefore **refused when
`NODE_ENV=production`**: `services/runner.ts` degrades to `disabled` and the Run
button reports that execution is off (the server also logs a warning at boot).
To keep the feature, self-host [Piston](https://github.com/engineer-man/piston)
and set `RUNNER=piston` with `PISTON_URL`. Otherwise set `RUNNER=disabled`
explicitly.

### 6. Post-deploy smoke test

Register → login → create a room → create files → type → wait for autosave →
**restart the backend service** → log in again → reopen the room. Every file and
its exact contents must come back; that is what proves Atlas is the source of
truth rather than server memory. Then open the room in a second browser to check
live collaboration, cursors, presence, chat and roles.

---

## Screenshots

Add your own captures here:

| View | File |
| --- | --- |
| Login | `docs/screenshots/login.png` |
| Dashboard | `docs/screenshots/dashboard.png` |
| Room — two collaborators + cursors | `docs/screenshots/room.png` |
| Chat + presence | `docs/screenshots/chat.png` |

---

## Security notes

- Passwords hashed with bcrypt (cost 12); the field is `select: false`, so a
  stray `res.json(user)` cannot leak the hash.
- JWT is httpOnly + `sameSite` + `secure` in production, with a configurable
  expiry and a minimal `{ sub }` payload.
- CORS is restricted to `CLIENT_URL` with credentials, on Express *and*
  Socket.IO.
- Zod validates every REST body, param and query — **and** every socket payload.
- Socket identity comes from the JWT; sender IDs, timestamps and roles in
  payloads are ignored.
- Room-scoping: a socket may only emit into rooms it joined and was authorized
  for.
- Code execution never trusts the client for source — it reads the server's
  `Y.Doc` — and `RUNNER=local` is refused in production. See
  [Code execution](#code-execution-the-run-button) for the full guard list.
- Rate limits: 5/min on auth endpoints, 10 chat messages per 10 s per socket,
  5 runs per minute per socket.
  Yjs updates are deliberately *not* rate-limited (they are high-frequency by
  design) but are size-capped instead.
- Login failures return one generic message, preventing account enumeration.
- Internal errors are logged server-side and returned as a generic message in
  production.

---

## Future improvements

- Ship a `docker-compose.yml` with Piston so `RUNNER=piston` works in one
  command, plus per-run memory/CPU limits.
- Invite links with expiry and per-link default roles (today an invite link
  grants the room's default `editor` role).
- Ownership transfer, and removing a member from a room.
- Drag-and-drop moves in the file tree (rename already moves a folder's
  subtree; there is no "move to another folder" gesture yet).
- Per-file presence in the collaborators panel ("editing src/utils.js").
- `@socket.io/redis-adapter` so several Node instances share rooms, plus a
  document-ownership strategy for the in-memory per-file `Y.Doc`s.
- Refresh-token rotation instead of a single long-lived access token.
- Offline editing with IndexedDB (`y-indexeddb`); the reconnect state-diff
  replay is already in place, this would survive a full page reload too.

---

## Interview discussion points

**Why a CRDT and not OT?** OT needs a central server that transforms every
operation against concurrent history — correct implementations are notoriously
subtle. CRDTs make concurrent operations commutative, so the server can be a
dumb relay and offline edits merge on reconnect. The trade-off is metadata
overhead per character, which is irrelevant at code-file scale.

**Why not use `y-websocket`?** Because the interesting engineering — handshake
authentication, membership checks, room scoping, persistence — is exactly what
`y-websocket` hides. Owning the Socket.IO layer means every update is
authenticated and scoped, and it composes with chat and presence on the same
connection.

**How is the echo loop avoided?** Remote updates are applied with the origin
tag `'remote'`, and the `ydoc.on('update')` handler ignores that origin. Without
it, every remote update would be rebroadcast forever.

**Why debounced persistence?** Writing on every keystroke would make MongoDB
the bottleneck. Keeping the authoritative `Y.Doc` in memory and flushing dirty
state every 3 s (plus a forced flush when the last client leaves and on
shutdown) trades a ≤3 s recovery window for orders of magnitude fewer writes.

**How does presence survive a closed tab?** `room:leave` is best-effort; the
real cleanup runs in the socket `disconnect` handler, which iterates
`socket.data.rooms`. That same handler releases the document refcount.

**What breaks at scale, and what fixes it?** Two Node instances would each hold
their own copy of a room's `Y.Doc`. The fix is the Socket.IO Redis adapter for
fan-out plus either sticky sessions per room or a shared document service —
deliberately out of scope for a single-instance MVP.

**Why is the JWT in a cookie rather than `localStorage`?** `localStorage` is
readable by any injected script; an httpOnly cookie is not. The cost is CSRF
exposure, which `sameSite` plus an origin-locked CORS policy addresses for this
deployment shape.

---

Built as a portfolio project — MIT licensed, use it freely.
