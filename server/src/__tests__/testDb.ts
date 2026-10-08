import mongoose from 'mongoose';
import { env } from '../config/env';

/**
 * Shared by every suite. Each suite calls dropDatabase(), so the target is
 * deliberately hard to aim at anything that matters: TEST_MONGODB_URI when
 * set, otherwise MONGODB_URI only if it is local, and the database name is
 * always `codesync_test`, never `codesync`.
 */
const TEST_DB_NAME = 'codesync_test';
const LOCAL_HOST_PATTERN = /(localhost|127\.0\.0\.1|\[::1\])/i;

function resolveTestUri(): string {
  const explicit = env.TEST_MONGODB_URI;
  if (explicit) return explicit;

  if (!LOCAL_HOST_PATTERN.test(env.MONGODB_URI)) {
    throw new Error(
      `Refusing to run destructive tests: MONGODB_URI is not a local instance and ` +
        `TEST_MONGODB_URI is not set. This suite drops the "${TEST_DB_NAME}" database — ` +
        `set TEST_MONGODB_URI to a throwaway instance first.`,
    );
  }
  return env.MONGODB_URI;
}

export async function connectTestDb(): Promise<void> {
  await mongoose.connect(resolveTestUri(), { dbName: TEST_DB_NAME });
  // Guard against a misconfigured dbName ever pointing the drop at real data.
  if (mongoose.connection.name !== TEST_DB_NAME) {
    throw new Error(`Expected to be connected to ${TEST_DB_NAME}, got ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
