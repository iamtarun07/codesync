import { io, type Socket } from 'socket.io-client';
import { getAuthToken } from './authToken';
import { SOCKET_URL } from './config';
import type {
  ActivityEntry,
  ChatMessage,
  RoomFile,
  RoomMemberView,
  RoomRole,
  RoomSettings,
  RunOutput,
} from '../types';

export interface ServerToClientEvents {
  'room:state': (payload: {
    roomId: string;
    name: string;
    language: string;
    role: RoomRole;
    files: RoomFile[];
    settings: RoomSettings;
  }) => void;
  'room:members': (payload: { roomId: string; members: RoomMemberView[] }) => void;
  'room:files': (payload: { roomId: string; files: RoomFile[] }) => void;
  'room:settings': (payload: { roomId: string; settings: RoomSettings }) => void;
  'room:role': (payload: { roomId: string; role: RoomRole }) => void;
  'file:state': (payload: {
    roomId: string;
    fileId: string;
    language: string;
    docState: ArrayBuffer;
  }) => void;
  'doc:update': (payload: { roomId: string; fileId: string; update: ArrayBuffer }) => void;
  'awareness:update': (payload: { roomId: string; fileId: string; update: ArrayBuffer }) => void;
  'room:language': (payload: {
    roomId: string;
    fileId: string;
    language: string;
    by: string;
  }) => void;
  'chat:message': (payload: ChatMessage) => void;
  'doc:saved': (payload: { roomId: string; fileId: string; savedAt: string }) => void;
  'activity:new': (payload: ActivityEntry) => void;
  'code:running': (payload: { roomId: string; by: string; language: string }) => void;
  'code:output': (payload: RunOutput) => void;
  'code:failed': (payload: { roomId: string; code: string; message: string }) => void;
  'session:pong': (payload: { sentAt: number }) => void;
  error: (payload: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'room:join': (payload: { roomId: string }) => void;
  'room:leave': (payload: { roomId: string }) => void;
  'file:open': (payload: { roomId: string; fileId: string }) => void;
  'file:create': (payload: { roomId: string; path: string; type?: 'file' | 'folder' }) => void;
  'file:rename': (payload: { roomId: string; fileId: string; name: string }) => void;
  'file:delete': (payload: { roomId: string; fileId: string }) => void;
  'doc:update': (payload: { roomId: string; fileId: string; update: Uint8Array }) => void;
  'awareness:update': (payload: { roomId: string; fileId: string; update: Uint8Array }) => void;
  'room:language': (payload: { roomId: string; fileId: string; language: string }) => void;
  'chat:send': (payload: { roomId: string; text: string }) => void;
  'doc:save': (payload: { roomId: string; fileId: string }) => void;
  'code:run': (payload: { roomId: string; fileId: string; stdin: string }) => void;
  'session:ping': (payload: { sentAt: number }) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * One socket for the whole app. Creating a socket inside a component would
 * spawn a new connection on every render and duplicate every listener.
 */
let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      // Callback form, not a static object: the socket is created before login,
      // and this re-reads the token on every (re)connect. The handshake cookie
      // is still preferred server-side; this covers browsers that drop it.
      auth: (cb) => cb({ token: getAuthToken() ?? undefined }),
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

export function connectSocket(): AppSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}

/** Normalises Socket.IO binary payloads (ArrayBuffer or Buffer-like) for Yjs. */
export function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}
