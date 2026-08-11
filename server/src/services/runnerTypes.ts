export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Runtime actually used, e.g. "python 3.10.0" or "python (local)". */
  runtime: string;
}

export class RunError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const MAX_SOURCE_LENGTH = 100_000;

/** Languages with a meaningful execution step. HTML/CSS/JSON/SQL are excluded. */
export const RUNNABLE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'cpp'] as const;
