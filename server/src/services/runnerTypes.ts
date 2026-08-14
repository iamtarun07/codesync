export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Runtime actually used, e.g. "Python 3.13" or "python (local)". */
  runtime: string;
  /** Sandbox verdict when the backend reports one ("Accepted", "Time Limit Exceeded"…). */
  status?: string;
  /** CPU time as measured by the sandbox, when available. */
  cpuTimeMs?: number | null;
  /** Peak memory in KB as measured by the sandbox, when available. */
  memoryKb?: number | null;
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
export const RUNNABLE_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
] as const;
