import type { ReactNode } from 'react';

type Tone = 'error' | 'warning' | 'info';

const TONES: Record<Tone, string> = {
  error: 'border-red-line bg-red-tint text-red',
  warning: 'border-amber-line bg-amber-tint text-amber',
  info: 'border-cyan-line bg-cyan-tint text-cyan',
};

interface AlertProps {
  tone?: Tone;
  children: ReactNode;
  /** Inline recovery control, e.g. a Reconnect button. */
  action?: ReactNode;
  onDismiss?: () => void;
}

export function Alert({ tone = 'error', children, action, onDismiss }: AlertProps) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-[6px] border px-3 py-2 text-[13px] ${TONES[tone]}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-[11px] opacity-60 transition hover:opacity-100"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
