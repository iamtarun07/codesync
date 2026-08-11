import { env, isProduction } from '../config/env';
import { isLocallyRunnable, localRequirement, runLocally } from './localRunner';
import { runOnPiston } from './pistonRunner';
import { MAX_SOURCE_LENGTH, RUNNABLE_LANGUAGES, RunError, type RunResult } from './runnerTypes';

export { MAX_SOURCE_LENGTH, RunError, type RunResult } from './runnerTypes';

/**
 * `local` spawns a child process on this host — correct for a development
 * machine, unacceptable on a public server, so it is refused in production.
 * `piston` delegates to a sandbox (self-hosted or whitelisted).
 */
function activeMode(): 'local' | 'piston' | 'disabled' {
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
        ? 'Local code execution is disabled in production — set RUNNER=piston with a sandboxed PISTON_URL'
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

  if (mode === 'piston') return runOnPiston(language, source, stdin);

  if (!isLocallyRunnable(language)) {
    throw new RunError(
      'RUNTIME_MISSING',
      `Running ${language} needs ${localRequirement(language)}`,
    );
  }
  return runLocally(language, source, stdin);
}
