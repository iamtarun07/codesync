import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // dotenv never overrides an existing value, so this wins over .env.
    env: { NODE_ENV: 'test' },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
