import 'dotenv/config';
import { z } from 'zod';

const LOCAL_HOST_PATTERN = /(localhost|127\.0\.0\.1|\[::1\])/i;
// Catches both untouched templates and the development throwaway values, so a
// deploy cannot inherit either.
const PLACEHOLDER_PATTERN = /^(YOUR_|PASTE_|CHANGE|<)|replace_me|dev_only/i;

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(5000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    CLIENT_URL: z.string().url().default('http://localhost:5173'),
    /**
     * Destructive test database. The suite drops whatever database it connects
     * to, so it refuses to run against a non-local MONGODB_URI unless this is
     * set explicitly. Never point it at a deployed cluster.
     */
    TEST_MONGODB_URI: z.string().optional(),
    // Code execution backend.
    //   judge0   – POST to a Judge0 sandbox at JUDGE0_URL (production default)
    //   piston   – POST to a Piston sandbox at PISTON_URL
    //   local    – spawn a child process on this host (dev machines only)
    //   disabled – the Run button reports that execution is off
    RUNNER: z.enum(['local', 'piston', 'judge0', 'disabled']).default('local'),
    PISTON_URL: z.string().url().default('https://emkc.org/api/v2/piston'),
    /** Judge0 instance. The public CE instance needs no key. */
    JUDGE0_URL: z.string().url().default('https://ce.judge0.com'),
    /** Self-hosted Judge0 with authn enabled (sent as X-Auth-Token). */
    JUDGE0_TOKEN: z.string().optional(),
    /** RapidAPI-hosted Judge0 — both must be set together. */
    JUDGE0_RAPIDAPI_KEY: z.string().optional(),
    JUDGE0_RAPIDAPI_HOST: z.string().optional(),
  })
  /**
   * Production must never inherit a development default. A deployed server that
   * quietly talks to localhost, or signs tokens with a placeholder secret, is
   * worse than one that refuses to boot.
   */
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    const require = (path: keyof typeof value, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (LOCAL_HOST_PATTERN.test(value.MONGODB_URI)) {
      require('MONGODB_URI', 'must point at the deployed database, not localhost');
    }
    if (PLACEHOLDER_PATTERN.test(value.MONGODB_URI)) {
      require('MONGODB_URI', 'still contains the placeholder value');
    }
    if (!process.env.CLIENT_URL) {
      require('CLIENT_URL', 'must be set explicitly in production (CORS + cookie origin)');
    } else if (LOCAL_HOST_PATTERN.test(value.CLIENT_URL)) {
      require('CLIENT_URL', 'must be the deployed frontend origin, not localhost');
    } else if (!value.CLIENT_URL.startsWith('https://')) {
      require('CLIENT_URL', 'must be https:// so the auth cookie (SameSite=None) is accepted');
    }
    if (PLACEHOLDER_PATTERN.test(value.JWT_SECRET) || value.JWT_SECRET.length < 32) {
      require('JWT_SECRET', 'must be a fresh random value of at least 32 characters');
    }
    if (value.RUNNER === 'piston' && LOCAL_HOST_PATTERN.test(value.PISTON_URL)) {
      require('PISTON_URL', 'must be reachable from the deployed server');
    }
    if (value.RUNNER === 'judge0' && LOCAL_HOST_PATTERN.test(value.JUDGE0_URL)) {
      require('JUDGE0_URL', 'must be reachable from the deployed server');
    }
    if (Boolean(value.JUDGE0_RAPIDAPI_KEY) !== Boolean(value.JUDGE0_RAPIDAPI_HOST)) {
      require('JUDGE0_RAPIDAPI_HOST', 'set both JUDGE0_RAPIDAPI_KEY and JUDGE0_RAPIDAPI_HOST, or neither');
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Fail fast: a half-configured server is worse than one that refuses to boot.
  console.error(`\nInvalid environment configuration:\n${details}\n\nSee server/.env.example\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

// Not fatal: the runner degrades to "disabled" by itself (services/runner.ts),
// but the operator should know the Run button will be off.
if (isProduction && env.RUNNER === 'local') {
  console.warn(
    '[env] RUNNER=local is refused in production — code execution is disabled. ' +
      'Set RUNNER=piston with a sandboxed PISTON_URL to enable it.',
  );
}
