import { env, isProduction } from '../config/env';
import { isJudge0Runnable, runOnJudge0 } from './judge0Runner';
import { isLocallyRunnable, localRequirement, runLocally } from './localRunner';
import { runOnPiston } from './pistonRunner';
import { MAX_SOURCE_LENGTH, RUNNABLE_LANGUAGES, RunError, type RunResult } from './runnerTypes';

export { MAX_SOURCE_LENGTH, RunError, type RunResult } from './runnerTypes';

/**
 * `judge0` sends the program to a Judge0 sandbox (public CE instance, a
 * self-hosted one, or RapidAPI) — nothing untrusted runs on this server, so it
 * is what production should use (render.yaml sets it). The env default stays
 * `local` for development machines.
 * `piston` is the equivalent for a self-hosted Piston sandbox.
 * `local` spawns a child process on this host — correct for a development
 * machine, unacceptable on a public server, so it is refused in production.
 */
function activeMode(): 'local' | 'piston' | 'judge0' | 'disabled' {
  if (env.RUNNER === 'disabled') return 'disabled';
  if (env.RUNNER === 'local' && isProduction) return 'disabled';
  return env.RUNNER;
}

export function isRunnable(language: string): boolean {
  return (RUNNABLE_LANGUAGES as readonly string[]).includes(language);
}

export async function runCode(language: string, source: string, stdin: string): Promise<RunResult> {
  const mode = activeMode();

  if (mode === 'disabled') {
    throw new RunError(
      'RUNNER_DISABLED',
      env.RUNNER === 'local'
        ? 'Local code execution is disabled in production — set RUNNER=judge0 (or piston) to enable a sandbox'
        : 'Code execution is disabled on this server',
    );
  }

  if (!isRunnable(language)) {
    throw new RunError('LANGUAGE_NOT_RUNNABLE', `${language} cannot be executed`);
  }
  if (source.trim().length === 0) throw new RunError('EMPTY_SOURCE', 'There is no code to run');
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new RunError('SOURCE_TOO_LARGE', 'The file is too large to execute');
  }

  if (mode === 'judge0') {
    if (!isJudge0Runnable(language)) {
      throw new RunError('LANGUAGE_NOT_RUNNABLE', `${language} is not available on this sandbox`);
    }
    return runOnJudge0(language, source, stdin);
  }

  if (mode === 'piston') return runOnPiston(language, source, stdin);

  if (!isLocallyRunnable(language)) {
    throw new RunError(
      'RUNTIME_MISSING',
      `Running ${language} needs ${localRequirement(language)}`,
    );
  }
  return runLocally(language, source, stdin);
}
