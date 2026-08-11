import mongoose from 'mongoose';
import { env } from './env';

/** Connection states Mongoose reports, mapped to something a probe can read. */
export type DbStatus = 'connected' | 'connecting' | 'disconnected';

export function dbStatus(): DbStatus {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

export function dbName(): string {
  return mongoose.connection.name ?? 'unknown';
}

let listenersAttached = false;

/**
 * Connection-lifecycle logging. Never logs the URI — it carries credentials.
 * Mongoose retries on its own after the first successful connection, so these
 * handlers only report; they must not reconnect manually.
 */
function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('error', (err: Error) => {
    console.error(`[db] connection error: ${err.name}`);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected — mongoose will retry');
  });
  mongoose.connection.on('reconnected', () => {
    console.log(`[db] reconnected to ${dbName()}`);
  });
}

export async function connectDB(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.set('strictQuery', true);
  attachListeners();

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      // Atlas over TLS on a cold start can exceed the 10s socket default.
      connectTimeoutMS: 15_000,
    });
  } catch (err) {
    // Mongoose puts the full connection string in some driver errors, so only
    // the error name/class is surfaced.
    const name = err instanceof Error ? err.name : 'UnknownError';
    console.error(
      `[db] could not connect (${name}). Check MONGODB_URI, the database user's ` +
        'permissions, and (on Atlas) the Network Access allow-list.',
    );
    throw new Error(`Database connection failed: ${name}`);
  }

  console.log(`[db] connected to ${dbName()}`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
