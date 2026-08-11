import { useState } from 'react';
import type { RunState } from '../../types';
import { Dot } from '../common/StatusDot';
import { Spinner } from '../common/Spinner';

interface OutputPanelProps {
  run: RunState;
  stdin: string;
  onStdinChange: (value: string) => void;
  onClear: () => void;
  open: boolean;
  onToggle: () => void;
}

export function OutputPanel({
  run,
  stdin,
  onStdinChange,
  onClear,
  open,
  onToggle,
}: OutputPanelProps) {
  const [showStdin, setShowStdin] = useState(false);
  const failed = run.status === 'failed' || (run.output?.exitCode ?? 0) !== 0;
  const hasOutput = Boolean(run.output?.stdout || run.output?.stderr);

  return (
    <section className="shrink-0 border-t border-line bg-surface">
      <header className="flex h-9 items-center gap-3 px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2 text-ink-muted transition hover:text-ink"
        >
          <span aria-hidden className={`text-[8px] transition-transform ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="t-label text-current">Output</span>
        </button>

        {run.status === 'running' ? (
          <span className="text-amber">
            <Spinner size={11} />
          </span>
        ) : (
          <Dot tone={run.status === 'idle' ? 'muted' : failed ? 'red' : 'lime'} />
        )}

        <span className="t-meta min-w-0 flex-1 truncate">
          {run.status === 'running'
            ? `running${run.by ? ` · started by ${run.by}` : ''}`
            : run.status === 'failed'
              ? 'run failed'
              : run.output
                ? `${run.output.runtime} · exit ${run.output.exitCode ?? '—'} · ${run.output.durationMs}ms · ${run.output.by}`
                : 'idle'}
        </span>

        <button
          type="button"
          onClick={() => setShowStdin((value) => !value)}
          className="t-meta rounded-[4px] px-1.5 py-0.5 transition hover:bg-elevated hover:text-ink"
        >
          stdin
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={run.status === 'idle'}
          className="t-meta rounded-[4px] px-1.5 py-0.5 transition hover:bg-elevated hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent"
        >
          clear
        </button>
      </header>

      {open ? (
        <div className="flex max-h-56 min-h-28 gap-2 border-t border-line px-3 py-2.5">
          <div className="min-h-24 flex-1 overflow-auto font-mono text-[12px] leading-[20px]">
            {run.status === 'idle' ? (
              <p className="text-ink-disabled">press run to execute the room buffer</p>
            ) : null}
            {run.status === 'running' ? <p className="text-ink-muted">executing…</p> : null}
            {run.status === 'failed' ? (
              <pre className="whitespace-pre-wrap break-words text-red">{run.error}</pre>
            ) : null}
            {run.output?.stdout ? (
              <pre className="whitespace-pre-wrap break-words text-ink">{run.output.stdout}</pre>
            ) : null}
            {run.output?.stderr ? (
              <pre className="whitespace-pre-wrap break-words text-red">{run.output.stderr}</pre>
            ) : null}
            {run.status === 'done' && !hasOutput ? (
              <p className="text-ink-muted">no output</p>
            ) : null}
          </div>

          {showStdin ? (
            <textarea
              value={stdin}
              onChange={(event) => onStdinChange(event.target.value)}
              placeholder="stdin"
              aria-label="Standard input"
              className="w-56 shrink-0 resize-none rounded-[6px] border border-line bg-elevated p-2 font-mono text-[12px] text-ink outline-none placeholder:text-ink-disabled focus:border-cyan"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
