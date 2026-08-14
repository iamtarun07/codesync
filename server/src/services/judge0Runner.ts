import { env } from '../config/env';
import { MAX_SOURCE_LENGTH, RunError, type RunResult } from './runnerTypes';

/**
 * Judge0 execution backend.
 *
 * Untrusted code never runs on this server: the source is forwarded to a Judge0
 * instance, which compiles and runs it inside its own isolated sandbox (isolate
 * + cgroups, no network) and returns the streams. The instance URL and any API
 * key live in server env only — the browser never sees either.
 *
 * Works against the public CE instance (no key), a self-hosted Judge0, or the
 * RapidAPI-hosted one (key via env).
 */

interface Judge0Status {
  id?: number;
  description?: string;
}

interface Judge0Submission {
  token?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  exit_code?: number | null;
  exit_signal?: number | null;
  time?: string | null;
  memory?: number | null;
  status?: Judge0Status;
  error?: string;
}

/**
 * Pinned language ids from GET /languages on the CE instance. Pinned rather
 * than resolved by name so a compiler upgrade upstream cannot silently change
 * behaviour; add new entries as languages are added to the editor.
 */
const LANGUAGE_IDS: Record<string, { id: number; label: string }> = {
  python: { id: 109, label: 'Python 3.13' },
  javascript: { id: 102, label: 'Node.js 22' },
  typescript: { id: 101, label: 'TypeScript 5.6' },
  java: { id: 91, label: 'Java (JDK 17)' },
  c: { id: 103, label: 'C (GCC 14)' },
  cpp: { id: 105, label: 'C++ (GCC 14)' },
};

/** Judge0 status ids (see docs/statuses). */
const IN_QUEUE = 1;
const PROCESSING = 2;
const ACCEPTED = 3;
const TIME_LIMIT_EXCEEDED = 5;
const COMPILATION_ERROR = 6;
const INTERNAL_ERROR = 13;
const EXEC_FORMAT_ERROR = 14;

const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 700;
const POLL_ATTEMPTS = 40; // ~28s, above the instance's 10s wall-clock limit
const MAX_OUTPUT_CHARS = 20_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(value: string | null | undefined): string {
  if (!value) return '';
  const text = Buffer.from(value, 'base64').toString('utf8');
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n…output truncated…`
    : text;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Self-hosted Judge0 with authn enabled.
  if (env.JUDGE0_TOKEN) headers['X-Auth-Token'] = env.JUDGE0_TOKEN;
  // RapidAPI-hosted Judge0.
  if (env.JUDGE0_RAPIDAPI_KEY && env.JUDGE0_RAPIDAPI_HOST) {
    headers['X-RapidAPI-Key'] = env.JUDGE0_RAPIDAPI_KEY;
    headers['X-RapidAPI-Host'] = env.JUDGE0_RAPIDAPI_HOST;
  }
  return headers;
}

/** Translates transport/HTTP failures into messages that are safe to show. */
function assertUsable(response: Response, body: Judge0Submission | null): void {
  if (response.status === 429) {
    throw new RunError(
      'RUNNER_BUSY',
      'The shared execution service is rate limited right now — wait a few seconds and run again',
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new RunError('RUNNER_UNAUTHORIZED', 'The execution service rejected this server’s key');
  }
  if (response.status === 422) {
    throw new RunError('RUNNER_FAILED', body?.error ?? 'The execution service rejected the program');
  }
  if (!response.ok || !body) {
    throw new RunError(
      'RUNNER_FAILED',
      response.status >= 500
        ? 'The execution service is having trouble — try again in a moment'
        : (body?.error ?? 'The execution service failed'),
    );
  }
}

async function request(path: string, init?: RequestInit): Promise<Judge0Submission> {
  let response: Response;
  try {
    response = await fetch(`${env.JUDGE0_URL}${path}`, {
      ...init,
      headers: authHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new RunError('RUNNER_UNREACHABLE', 'The code execution service is unreachable');
  }

  const body = (await response.json().catch(() => null)) as Judge0Submission | null;
  assertUsable(response, body);
  return body as Judge0Submission;
}

/** Some instances disable `wait=true`; then the result has to be polled. */
async function awaitResult(submission: Judge0Submission): Promise<Judge0Submission> {
  const settled = (s: Judge0Submission) => {
    const id = s.status?.id;
    return typeof id === 'number' && id !== IN_QUEUE && id !== PROCESSING;
  };

  if (settled(submission)) return submission;
  if (!submission.token) {
    throw new RunError('RUNNER_FAILED', 'The execution service returned no result');
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_INTERVAL_MS);
    const polled = await request(
      `/submissions/${submission.token}?base64_encoded=true&fields=*`,
      { method: 'GET' },
    );
    if (settled(polled)) return polled;
  }

  throw new RunError('RUNNER_TIMEOUT', 'The execution service did not return a result in time');
}

export function isJudge0Runnable(language: string): boolean {
  return language in LANGUAGE_IDS;
}

export async function runOnJudge0(
  language: string,
  source: string,
  stdin: string,
): Promise<RunResult> {
  const runtime = LANGUAGE_IDS[language];
  if (!runtime) throw new RunError('LANGUAGE_NOT_RUNNABLE', `${language} cannot be executed`);
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new RunError('SOURCE_TOO_LARGE', 'The file is too large to execute');
  }

  // base64 keeps arbitrary bytes (unicode, CRLF, quotes) intact in both directions.
  const created = await request('/submissions?base64_encoded=true&wait=true&fields=*', {
    method: 'POST',
    body: JSON.stringify({
      language_id: runtime.id,
      source_code: Buffer.from(source, 'utf8').toString('base64'),
      stdin: Buffer.from(stdin ?? '', 'utf8').toString('base64'),
    }),
  });

  const result = await awaitResult(created);
  const statusId = result.status?.id;
  const statusText = result.status?.description ?? 'Unknown';

  // The sandbox itself failed — that is our problem, not the user's code.
  if (statusId === INTERNAL_ERROR || statusId === EXEC_FORMAT_ERROR) {
    throw new RunError(
      'RUNNER_FAILED',
      `The execution service could not run this program (${statusText})`,
    );
  }

  const cpuTimeMs = result.time ? Math.round(Number.parseFloat(result.time) * 1000) : null;
  const base = {
    runtime: runtime.label,
    status: statusText,
    cpuTimeMs: Number.isFinite(cpuTimeMs) ? cpuTimeMs : null,
    memoryKb: result.memory ?? null,
  };

  // A failed compile never reaches the run stage.
  if (statusId === COMPILATION_ERROR) {
    return {
      ...base,
      stdout: '',
      stderr: decode(result.compile_output) || 'Compilation failed',
      exitCode: null,
    };
  }

  const stdout = decode(result.stdout);
  const stderr = decode(result.stderr);
  const message = decode(result.message);

  if (statusId === TIME_LIMIT_EXCEEDED) {
    return {
      ...base,
      stdout,
      stderr: [stderr, 'Execution timed out — the program exceeded the sandbox CPU limit']
        .filter(Boolean)
        .join('\n'),
      exitCode: null,
    };
  }

  // Runtime failures (non-zero exit, SIGSEGV, SIGFPE, …) keep their streams and
  // carry the sandbox's own description so the cause is visible.
  const runtimeFailure = typeof statusId === 'number' && statusId > ACCEPTED;
  return {
    ...base,
    stdout,
    stderr: runtimeFailure
      ? [stderr, message, stderr || message ? '' : statusText].filter(Boolean).join('\n')
      : stderr,
    exitCode: result.exit_code ?? (statusId === ACCEPTED ? 0 : null),
  };
}
