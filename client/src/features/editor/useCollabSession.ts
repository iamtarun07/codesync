import { useEffect, useRef, useState } from 'react';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { connectSocket, toUint8Array } from '../../services/socket';
import { messageReceived } from '../chat/chatSlice';
import { setMembers } from '../presence/presenceSlice';
import {
  activityAdded,
  roomStateReceived,
  runFailed,
  runFinished,
  runStarted,
  setConnection,
  setFiles,
  setLanguage,
  setMyRole,
  setSaved,
  setSettings,
  setSocketError,
} from '../rooms/roomSlice';
import { accentForUser } from '../../utils/format';
import type {
  ActivityEntry,
  ChatMessage,
  RoomFile,
  RoomMemberView,
  RoomRole,
  RoomSettings,
  RunOutput,
  User,
} from '../../types';

/** Must match Y_TEXT_KEY on the server. */
export const Y_TEXT_KEY = 'monaco';

const PING_INTERVAL_MS = 5_000;
/** A Yjs update carrying no new items encodes to 2 bytes. */
const EMPTY_UPDATE_BYTES = 2;

export interface RemoteUser {
  clientId: number;
  name: string;
  color: string;
  contrast: string;
}

export interface SessionMetrics {
  /** Sum of per-client Yjs clocks — identical on every peer, monotonic. */
  rev: number;
  latencyMs: number | null;
  connectedSince: number | null;
}

interface CollabSession {
  ydoc: Y.Doc | null;
  awareness: Awareness | null;
  /** True once the server's state for the active file has been applied. */
  synced: boolean;
  remoteUsers: RemoteUser[];
  metrics: SessionMetrics;
}

/**
 * Yjs has no revision counter, but the sum of every client's clock is a stable
 * monotonic number that every peer agrees on — exactly what "rev" needs to be.
 * `store.clients` is internal API, stable across yjs 13.x.
 */
function docRevision(doc: Y.Doc): number {
  let total = 0;
  doc.store.clients.forEach((items) => {
    const last = items[items.length - 1];
    if (last) total += last.id.clock + last.length;
  });
  return total;
}

/**
 * Owns the CRDT session for one open file:
 *   Monaco <-> y-monaco <-> Y.Doc <-> Socket.IO <-> server Y.Doc <-> MongoDB
 *
 * Three effects, deliberately separate:
 *   1. room  — joins the room and handles room-wide events. Runs once per room.
 *   2. doc   — owns the Y.Doc for the active file. Runs once per file.
 *   3. open  — asks the server for that file's stream, after every (re)join.
 *
 * Splitting them means switching files does not churn presence, and a reconnect
 * does not destroy the local document (which would drop offline edits).
 */
export function useCollabSession(
  roomId: string,
  user: User | null,
  fileId: string | null,
): CollabSession {
  const dispatch = useAppDispatch();
  const myRole = useAppSelector((state) => state.room.myRole);

  const [session, setSession] = useState<{
    fileId: string;
    ydoc: Y.Doc;
    awareness: Awareness;
  } | null>(null);
  const [synced, setSynced] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [metrics, setMetrics] = useState<SessionMetrics>({
    rev: 0,
    latencyMs: null,
    connectedSince: null,
  });
  /** Bumped on every `room:state`, i.e. on the first join and every rejoin. */
  const [joinToken, setJoinToken] = useState(0);

  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const roleRef = useRef<RoomRole | null>(myRole);
  roleRef.current = myRole;

  // ---- 1. room session ----------------------------------------------------
  useEffect(() => {
    if (!user || !roomId) return;

    const socket = connectSocket();
    dispatch(setConnection(socket.connected ? 'connected' : 'connecting'));

    const join = () => {
      dispatch(setConnection('connected'));
      setMetrics((prev) => ({ ...prev, connectedSince: prev.connectedSince ?? Date.now() }));
      socket.emit('room:join', { roomId });
    };

    const handleState = (payload: {
      roomId: string;
      name: string;
      language: string;
      role: RoomRole;
      files: RoomFile[];
      settings: RoomSettings;
    }) => {
      if (payload.roomId !== roomId) return;
      dispatch(
        roomStateReceived({
          role: payload.role,
          files: payload.files,
          settings: payload.settings,
          name: payload.name,
        }),
      );
      setJoinToken((token) => token + 1);
    };

    const handleMembers = (payload: { roomId: string; members: RoomMemberView[] }) => {
      if (payload.roomId === roomId) dispatch(setMembers(payload.members));
    };

    const handleFiles = (payload: { roomId: string; files: RoomFile[] }) => {
      if (payload.roomId === roomId) dispatch(setFiles(payload.files));
    };

    const handleSettings = (payload: { roomId: string; settings: RoomSettings }) => {
      if (payload.roomId === roomId) dispatch(setSettings(payload.settings));
    };

    const handleRole = (payload: { roomId: string; role: RoomRole }) => {
      if (payload.roomId !== roomId) return;
      dispatch(setMyRole(payload.role));
      dispatch(
        setSocketError(
          payload.role === 'viewer'
            ? 'Your access changed to view-only'
            : `Your access changed to ${payload.role}`,
        ),
      );
    };

    const handleActivity = (payload: ActivityEntry) => {
      if (payload.roomId === roomId) dispatch(activityAdded(payload));
    };

    const handleLanguage = (payload: { roomId: string; fileId: string; language: string }) => {
      if (payload.roomId === roomId && payload.fileId === fileIdRef.current) {
        dispatch(setLanguage(payload.language));
      }
    };

    const handleSaved = (payload: { roomId: string; savedAt: string }) => {
      if (payload.roomId === roomId) dispatch(setSaved(payload.savedAt));
    };

    const handleChat = (payload: ChatMessage) => {
      if (payload.roomId === roomId) dispatch(messageReceived(payload));
    };

    const handleError = (payload: { code: string; message: string }) => {
      dispatch(setSocketError(payload.message));
    };

    // Execution results are broadcast to the whole room, so every collaborator
    // sees the same output as the person who pressed Run.
    const handleRunning = (payload: { roomId: string; by: string }) => {
      if (payload.roomId === roomId) dispatch(runStarted(payload.by));
    };

    const handleOutput = (payload: RunOutput) => {
      if (payload.roomId === roomId) dispatch(runFinished(payload));
    };

    const handleRunFailed = (payload: { roomId: string; message: string }) => {
      if (payload.roomId === roomId) dispatch(runFailed(payload.message));
    };

    const handlePong = (payload: { sentAt: number }) => {
      setMetrics((prev) => ({ ...prev, latencyMs: Date.now() - payload.sentAt }));
    };

    const handleDisconnect = () => {
      setSynced(false);
      setMetrics((prev) => ({ ...prev, latencyMs: null, connectedSince: null }));
      dispatch(setConnection('disconnected'));
    };

    const handleConnectError = () => dispatch(setConnection('disconnected'));

    socket.on('connect', join);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('room:state', handleState);
    socket.on('room:members', handleMembers);
    socket.on('room:files', handleFiles);
    socket.on('room:settings', handleSettings);
    socket.on('room:role', handleRole);
    socket.on('room:language', handleLanguage);
    socket.on('activity:new', handleActivity);
    socket.on('doc:saved', handleSaved);
    socket.on('chat:message', handleChat);
    socket.on('code:running', handleRunning);
    socket.on('code:output', handleOutput);
    socket.on('code:failed', handleRunFailed);
    socket.on('session:pong', handlePong);
    socket.on('error', handleError);

    if (socket.connected) join();

    const pingTimer = setInterval(() => {
      if (socket.connected) socket.emit('session:ping', { sentAt: Date.now() });
    }, PING_INTERVAL_MS);
    if (socket.connected) socket.emit('session:ping', { sentAt: Date.now() });

    return () => {
      clearInterval(pingTimer);
      socket.off('connect', join);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('room:state', handleState);
      socket.off('room:members', handleMembers);
      socket.off('room:files', handleFiles);
      socket.off('room:settings', handleSettings);
      socket.off('room:role', handleRole);
      socket.off('room:language', handleLanguage);
      socket.off('activity:new', handleActivity);
      socket.off('doc:saved', handleSaved);
      socket.off('chat:message', handleChat);
      socket.off('code:running', handleRunning);
      socket.off('code:output', handleOutput);
      socket.off('code:failed', handleRunFailed);
      socket.off('session:pong', handlePong);
      socket.off('error', handleError);

      if (socket.connected) socket.emit('room:leave', { roomId });
      setJoinToken(0);
      setMetrics({ rev: 0, latencyMs: null, connectedSince: null });
    };
  }, [roomId, user, dispatch]);

  // ---- 2. per-file CRDT document ------------------------------------------
  useEffect(() => {
    if (!user || !roomId || !fileId) return;

    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    /** Set once the server state for this file has landed. */
    const ready = { current: false };

    setSession({ fileId, ydoc, awareness });
    setSynced(false);
    setRemoteUsers([]);

    const socket = connectSocket();
    const accent = accentForUser(user.id);
    awareness.setLocalStateField('user', {
      name: user.username,
      color: accent.color,
      contrast: accent.contrast,
      userId: user.id,
    });

    const publishAwareness = (clients: number[]) => {
      if (clients.length === 0 || !socket.connected || !ready.current) return;
      socket.emit('awareness:update', {
        roomId,
        fileId,
        update: encodeAwarenessUpdate(awareness, clients),
      });
    };

    // ---- outgoing ---------------------------------------------------------
    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      setMetrics((prev) => ({ ...prev, rev: docRevision(ydoc) }));
      if (origin === 'remote') return;
      // Before the server stream is attached (first open, or a reconnect), local
      // edits are not dropped: they are replayed as a state diff in handleState.
      if (!ready.current || !socket.connected) return;
      socket.emit('doc:update', { roomId, fileId, update });
    };

    const onAwarenessUpdate = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === 'remote') return;
      publishAwareness([...added, ...updated, ...removed]);
    };

    ydoc.on('update', onDocUpdate);
    awareness.on('update', onAwarenessUpdate);

    // ---- incoming ---------------------------------------------------------
    const handleFileState = (payload: {
      roomId: string;
      fileId: string;
      language: string;
      docState: ArrayBuffer;
    }) => {
      if (payload.roomId !== roomId || payload.fileId !== fileId) return;

      const state = toUint8Array(payload.docState);
      if (state && state.byteLength > 0) Y.applyUpdate(ydoc, state, 'remote');

      ready.current = true;
      setSynced(true);
      dispatch(setLanguage(payload.language));
      setMetrics((prev) => ({ ...prev, rev: docRevision(ydoc) }));

      // Anything this client has that the server does not (offline edits made
      // while the socket was down) is replayed now as a single CRDT diff. This
      // is what keeps a reconnecting peer from silently diverging.
      if (state && roleRef.current !== 'viewer') {
        const missing = Y.encodeStateAsUpdate(ydoc, Y.encodeStateVectorFromUpdate(state));
        if (missing.byteLength > EMPTY_UPDATE_BYTES) {
          socket.emit('doc:update', { roomId, fileId, update: missing });
        }
      }

      // Announce ourselves to everyone already viewing this file.
      publishAwareness([awareness.clientID]);
    };

    const handleDocUpdate = (payload: { roomId: string; fileId: string; update: ArrayBuffer }) => {
      if (payload.roomId !== roomId || payload.fileId !== fileId) return;
      const update = toUint8Array(payload.update);
      if (update) Y.applyUpdate(ydoc, update, 'remote');
    };

    const handleAwareness = (payload: { roomId: string; fileId: string; update: ArrayBuffer }) => {
      if (payload.roomId !== roomId || payload.fileId !== fileId) return;
      const update = toUint8Array(payload.update);
      if (update) applyAwarenessUpdate(awareness, update, 'remote');
    };

    const handleMembersChanged = () => {
      // Someone joined or left: re-broadcast our cursor so newcomers see it.
      publishAwareness([awareness.clientID]);
    };

    const handleDisconnect = () => {
      ready.current = false;
      setSynced(false);
    };

    socket.on('file:state', handleFileState);
    socket.on('doc:update', handleDocUpdate);
    socket.on('awareness:update', handleAwareness);
    socket.on('room:members', handleMembersChanged);
    socket.on('disconnect', handleDisconnect);

    // ---- awareness -> remote cursor metadata -------------------------------
    const syncRemoteUsers = () => {
      const users: RemoteUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const info = (state as { user?: { name?: string; color?: string; contrast?: string } }).user;
        if (!info?.name) return;
        users.push({
          clientId,
          name: info.name,
          color: info.color ?? '#22d3ee',
          contrast: info.contrast ?? '#04191c',
        });
      });
      setRemoteUsers(users);
    };
    awareness.on('change', syncRemoteUsers);

    return () => {
      socket.off('file:state', handleFileState);
      socket.off('doc:update', handleDocUpdate);
      socket.off('awareness:update', handleAwareness);
      socket.off('room:members', handleMembersChanged);
      socket.off('disconnect', handleDisconnect);

      ydoc.off('update', onDocUpdate);
      awareness.off('update', onAwarenessUpdate);
      awareness.off('change', syncRemoteUsers);

      awareness.destroy();
      ydoc.destroy();
      setSession(null);
      setSynced(false);
      setRemoteUsers([]);
    };
  }, [roomId, fileId, user, dispatch]);

  // ---- 3. subscribe to the file stream ------------------------------------
  useEffect(() => {
    if (!fileId || !session || session.fileId !== fileId || joinToken === 0) return;
    // Runs after the room join is confirmed, after every reconnect, and after a
    // role change — the server answers with `file:state`, which is also how a
    // freshly promoted editor pushes edits the server refused while read-only.
    connectSocket().emit('file:open', { roomId, fileId });
  }, [roomId, fileId, session, joinToken, myRole]);

  return {
    ydoc: session?.ydoc ?? null,
    awareness: session?.awareness ?? null,
    synced,
    remoteUsers,
    metrics,
  };
}
