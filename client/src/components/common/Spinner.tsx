interface SpinnerProps {
  size?: number;
  label?: string;
  className?: string;
}

export function Spinner({ size = 16, label, className = '' }: SpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="cs-spin rounded-full border-[1.5px] border-current border-t-transparent"
      />
      {label ? <span className="t-meta text-current">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-bg text-ink-muted">
      <Spinner size={20} label={label} />
    </div>
  );
}
