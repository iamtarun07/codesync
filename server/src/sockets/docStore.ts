import * as Y from 'yjs';
import { Room } from '../models/Room';

/** Shared Y.Text key. The client binds Monaco to the same name. */
export const Y_TEXT_KEY = 'monaco';

const SAVE_INTERVAL_MS = 3_000;

interface FileDoc {
  roomId: string;
  fileId: string;
  doc: Y.Doc;
  clients: number;
  dirty: boolean;
  timer: NodeJS.Timeout;
}

/** `roomId::fileId` -> live document. Evicted when no socket has it open. */
const docs = new Map<string, FileDoc>();

export function docKey(roomId: string, fileId: string): string {
  return `${roomId}::${fileId}`;
}

/**
 * Loads the persisted Yjs state for one file and keeps it in memory while at
 * least one socket has that file open. Every acquire must be paired with a
 * releaseDoc call (file switch, room leave, disconnect).
 *
 * Returns null when the file no longer exists.
 */
export async function acquireDoc(roomId: string, fileId: string): Promise<Y.Doc | null> {
  const key = docKey(roomId, fileId);
  const existing = docs.get(key);
  if (existing) {
    existing.clients += 1;
    return existing.doc;
  }

  // ponytail: loads every file's docState for the room; fine at 60 files/room,
  // switch to an $elemMatch projection if workspaces ever get large.
  const room = await Room.findOne({ roomId }).select('+files.docState');
  const file = room?.files.find((f) => f.fileId === fileId && f.type === 'file');
  if (!file) return null;

  const doc = new Y.Doc();
  if (file.docState && file.docState.length > 0) {
    Y.applyUpdate(doc, new Uint8Array(file.docState));
  } else if (file.content) {
    // Migrated or seeded file with plain text only — bootstrap the CRDT once.
    doc.getText(Y_TEXT_KEY).insert(0, file.content);
  }

  const entry: FileDoc = {
    roomId,
    fileId,
    doc,
    clients: 1,
    dirty: false,
    timer: setInterval(() => {
      void flushDoc(roomId, fileId);
    }, SAVE_INTERVAL_MS),
  };
  doc.on('update', () => {
    entry.dirty = true;
  });

  docs.set(key, entry);
  return doc;
}

export function applyRemoteUpdate(roomId: string, fileId: string, update: Uint8Array): boolean {
  const entry = docs.get(docKey(roomId, fileId));
  if (!entry) return false;
  Y.applyUpdate(entry.doc, update, 'socket');
  return true;
}

export function encodeState(roomId: string, fileId: string): Uint8Array | null {
  const entry = docs.get(docKey(roomId, fileId));
  return entry ? Y.encodeStateAsUpdate(entry.doc) : null;
}

export function getLiveContent(roomId: string, fileId: string): string | null {
  const entry = docs.get(docKey(roomId, fileId));
  return entry ? entry.doc.getText(Y_TEXT_KEY).toString() : null;
}

/** Debounced persistence: writes only when the document actually changed. */
export async function flushDoc(roomId: string, fileId: string, force = false): Promise<boolean> {
  const entry = docs.get(docKey(roomId, fileId));
  if (!entry) return false;
  if (!entry.dirty && !force) return false;

  entry.dirty = false;
  const state = Buffer.from(Y.encodeStateAsUpdate(entry.doc));
  const content = entry.doc.getText(Y_TEXT_KEY).toString();

  try {
    await Room.updateOne(
      { roomId, 'files.fileId': fileId },
      {
        $set: {
          'files.$.docState': state,
          'files.$.content': content,
          'files.$.updatedAt': new Date(),
          // Room-level mirror = most recently persisted buffer (dashboard preview).
          content,
        },
      },
    );
    return true;
  } catch (err) {
    // Retry on the next tick rather than losing the change.
    entry.dirty = true;
    console.error(`[docStore] failed to persist ${roomId}/${fileId}`, err);
    return false;
  }
}

/** Last socket out saves the document and frees the memory. */
export async function releaseDoc(roomId: string, fileId: string): Promise<void> {
  const key = docKey(roomId, fileId);
  const entry = docs.get(key);
  if (!entry) return;

  entry.clients -= 1;
  if (entry.clients > 0) return;

  await flushDoc(roomId, fileId, true);
  clearInterval(entry.timer);
  entry.doc.destroy();
  docs.delete(key);
}

/** Drops one in-memory document without saving (file deleted). */
export function evictDoc(roomId: string, fileId: string): void {
  const key = docKey(roomId, fileId);
  const entry = docs.get(key);
  if (!entry) return;
  clearInterval(entry.timer);
  entry.doc.destroy();
  docs.delete(key);
}

/** Drops every document of a room without saving (room deleted). */
export function evictRoomDocs(roomId: string): void {
  for (const entry of [...docs.values()]) {
    if (entry.roomId === roomId) evictDoc(roomId, entry.fileId);
  }
}

/** Flush everything on shutdown so an in-flight session is not lost. */
export async function flushAllDocs(): Promise<void> {
  await Promise.all([...docs.values()].map((entry) => flushDoc(entry.roomId, entry.fileId, true)));
}
