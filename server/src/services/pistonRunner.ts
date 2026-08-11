import { env } from '../config/env';
import { MAX_SOURCE_LENGTH, RunError, type RunResult } from './runnerTypes';

interface PistonStage {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  signal?: string | null;
}

interface PistonResponse {
  language?: string;
  version?: string;
  compile?: PistonStage;
  run?: PistonStage;
  message?: string;
}

const RUNTIMES: Record<string, { language: string; version: string; file: string }> = {
  javascript: { language: 'javascript', version: '*', file: 'main.js' },
  typescript: { language: 'typescript', version: '*', file: 'main.ts' },
  python: { language: 'python', version: '*', file: 'main.py' },
  java: { language: 'java', version: '*', file: 'Main.java' },
  cpp: { language: 'c++', version: '*', file: 'main.cpp' },
};

const REQUEST_TIMEOUT_MS = 25_000;
const RUN_TIMEOUT_MS = 8_000;

function truncate(value: string | undefined, limit = 20_000): string {
  if (!value) return '';
  return value.length > limit ? `${value.slice(0, limit)}\n…output truncated…` : value;
}

/**
 * Executes source in a remote Piston sandbox. Nothing runs on this server.
 *
 * Note: the free public instance at emkc.org became whitelist-only in
 * February 2026, so this path expects a self-hosted Piston (PISTON_URL).
 */
export async function runOnPiston(
  language: string,
  source: string,
  stdin: string,
): Promise<RunResult> {
  const runtime = RUNTIMES[language];
  if (!runtime) throw new RunError('LANGUAGE_NOT_RUNNABLE', `${language} cannot be executed`);
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new RunError('SOURCE_TOO_LARGE', 'The file is too large to execute');
  }

  let response: Response;
  try {
    response = await fetch(`${env.PISTON_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: [{ name: runtime.file, content: source }],
        stdin,
        run_timeout: RUN_TIMEOUT_MS,
        compile_timeout: RUN_TIMEOUT_MS,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new RunError('RUNNER_UNREACHABLE', 'The code execution service is unreachable');
  }

  if (response.status === 429) {
    throw new RunError('RUNNER_BUSY', 'The execution service is busy, try again in a moment');
  }

  const body = (await response.json().catch(() => null)) as PistonResponse | null;

  if (!response.ok || !body) {
    throw new RunError('RUNNER_FAILED', body?.message ?? 'The code execution service failed');
  }

  const label = `${body.language ?? language} ${body.version ?? ''}`.trim();

  // A failed compile never reaches the run stage — surface its stderr instead.
  if (body.compile && typeof body.compile.code === 'number' && body.compile.code !== 0) {
    return {
      stdout: truncate(body.compile.stdout),
      stderr: truncate(body.compile.stderr) || 'Compilation failed',
      exitCode: body.compile.code,
      runtime: label,
    };
  }

  const run = body.run ?? {};
  const signal = run.signal ? `\nProcess terminated by signal ${run.signal}` : '';

  return {
    stdout: truncate(run.stdout),
    stderr: truncate(run.stderr) + signal,
    exitCode: run.code ?? null,
    runtime: label,
  };
}
