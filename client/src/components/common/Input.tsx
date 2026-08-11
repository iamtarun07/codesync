import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Rendered on the label row, right-aligned (e.g. a "Forgot?" link). */
  action?: ReactNode;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, action, mono = false, id, className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="t-label">
          {label}
        </label>
        {action}
      </div>

      <input
        {...rest}
        id={inputId}
        ref={ref}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={`h-10 w-full rounded-[6px] border bg-elevated px-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-disabled focus:border-cyan disabled:cursor-not-allowed disabled:opacity-50 ${
          error ? 'border-red' : 'border-line hover:border-line-strong'
        } ${mono ? 'font-mono tracking-[0.08em]' : ''} ${className}`}
      />

      {error ? (
        <p id={`${inputId}-error`} className="flex items-center gap-1.5 text-[12px] text-red">
          <span aria-hidden>✕</span>
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="t-caption">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
