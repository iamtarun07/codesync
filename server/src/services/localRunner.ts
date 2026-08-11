import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { RunError, type RunResult } from './runnerTypes';

const RUN_TIMEOUT_MS = 8_000;
const MAX_OUTPUT_CHARS = 20_000;

interface Step {
  /** Candidate executables, tried in order — the first one present wins. */
  commands: string[];
  args: (file: string, dir: string) => string[];
}

interface LocalRuntime {
  file: string;
  /** Optional compile step; a non-zero exit short-circuits the run. */
  compile?: Step;
  run: Step;
  /** Extra gate, e.g. a minimum Node version for TypeScript stripping. */
  available?: () => boolean;
  requirement: string;
}

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
const binarySuffix = process.platform === 'win32' ? '.exe' : '';

const RUNTIMES: Record<string, LocalRuntime> = {
  javascript: {
    file: 'main.js',
    run: { commands: ['node'], args: (file) => [file] },
    requirement: 'Node.js',
  },
  typescript: {
    file: 'main.ts',
    // Node strips TypeScript types natively from v23; no toolchain needed.
    run: { commands: ['node'], args: (file) => [file] },
    available: () => nodeMajor >= 23,
    requirement: 'Node.js 23+ (native TypeScript stripping)',
  },
  python: {
    file: 'main.py',
    run: { commands: ['python3', 'python'], args: (file) => [file] },
    requirement: 'Python 3 (`python3` or `python` on PATH)',
  },
  java: {
    file: 'Main.java',
    // Single-file source launch (Java 11+) — no separate javac step.
    run: { commands: ['java'], args: (file) => [file] },
    requirement: 'JDK 11+ (`java` on PATH)',
  },
  cpp: {
    file: 'main.cpp',
    compile: {
      commands: ['g++', 'c++', 'clang++'],
      args: (file, dir) => [file, '-O1', '-std=c++17', '-o', path.join(dir, `prog${binarySuffix}`)],
    },
    run: { commands: [], args: () => [] },
    requirement: 'A C++ compiler (`g++`, `c++` or `clang++` on PATH)',
  },
};

export function isLocallyRunnable(language: string): boolean {
  const runtime = RUNTIMES[language];
  return Boolean(runtime) && (runtime.available?.() ?? true);
}

export function localRequirement(language: string): string {
  return RUNTIMES[language]?.requirement ?? 'an interpreter or compiler';
}

interface ProcResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

const MISSING = Symbol('missing-executable');

function execute(
  command: string,
  args: string[],
  cwd: string,
  stdin: string,
): Promise<ProcResult | typeof MISSING> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      timeout: RUN_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      // No shell: arguments are passed verbatim, so nothing in the source can
      // be interpreted as a shell metacharacter.
      shell: false,
      // A blank environment except PATH — the program cannot read our secrets.
      env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '' },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_CHARS) stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_CHARS) stderr += chunk.toString();
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return resolve(MISSING);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (signal === 'SIGKILL' || signal === 'SIGTERM') timedOut = true;
      resolve({ stdout, stderr, code, timedOut });
    });

    child.stdin.on('error', () => {
      /* the program may exit without reading stdin — not an error */
    });
    child.stdin.end(stdin);
  });
}

/** Runs a step against its candidate executables, returning null if none exist. */
async function runStep(
  step: Step,
  file: string,
  dir: string,
  stdin: string,
): Promise<ProcResult | null> {
  for (const command of step.commands) {
    const result = await execute(command, step.args(file, dir), dir, stdin);
    if (result !== MISSING) return result;
  }
  return null;
}

function truncate(value: string): string {
  return value.length > MAX_OUTPUT_CHARS
    ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n…output truncated…`
    : value;
}

/**
 * Stack traces embed the absolute temp path, which leaks the server's OS
 * username to every collaborator in the room. Rewrite it to the bare filename.
 */
function scrubPaths(value: string, dir: string): string {
  if (!value) return value;
  const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`${escaped}[\\\\/]?`, 'g'), '');
}

/**
 * Executes source in a throwaway temp directory as a child process.
 *
 * This is arbitrary code execution on the host, which is fine for a local
 * development machine and NOT fine on a public server — the caller gates this
 * on RUNNER=local, which is refused in production.
 */
export async function runLocally(
  language: string,
  source: string,
  stdin: string,
): Promise<RunResult> {
  const runtime = RUNTIMES[language];
  if (!runtime) throw new RunError('LANGUAGE_NOT_RUNNABLE', `${language} cannot be executed`);
  if (runtime.available && !runtime.available()) {
    throw new RunError('RUNTIME_MISSING', `Running ${language} needs ${runtime.requirement}`);
  }

  const dir = await mkdtemp(path.join(tmpdir(), `codesync-${randomBytes(6).toString('hex')}-`));
  const file = path.join(dir, runtime.file);

  try {
    await writeFile(file, source, 'utf8');

    if (runtime.compile) {
      const compiled = await runStep(runtime.compile, file, dir, '');
      if (!compiled) {
        throw new RunError('RUNTIME_MISSING', `Running ${language} needs ${runtime.requirement}`);
      }
      if (compiled.timedOut) {
        return { stdout: '', stderr: 'Compilation timed out', exitCode: null, runtime: language };
      }
      if (compiled.code !== 0) {
        return {
          stdout: scrubPaths(truncate(compiled.stdout), dir),
          stderr: scrubPaths(truncate(compiled.stderr), dir) || 'Compilation failed',
          exitCode: compiled.code,
          runtime: `${language} (compile)`,
        };
      }
    }

    const runStepDef: Step = runtime.compile
      ? { commands: [path.join(dir, `prog${binarySuffix}`)], args: () => [] }
      : runtime.run;

    const result = await runStep(runStepDef, file, dir, stdin);
    if (!result) {
      throw new RunError('RUNTIME_MISSING', `Running ${language} needs ${runtime.requirement}`);
    }

    const stderr = scrubPaths(truncate(result.stderr), dir);
    return {
      stdout: scrubPaths(truncate(result.stdout), dir),
      stderr: result.timedOut
        ? `${stderr}\nExecution timed out after ${RUN_TIMEOUT_MS / 1000}s`
        : stderr,
      exitCode: result.timedOut ? null : result.code,
      runtime: `${language} (local)`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
