import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-cyan text-cyan-contrast border border-cyan hover:brightness-110 active:brightness-95',
  secondary:
    'bg-elevated text-ink border border-line hover:border-line-strong hover:bg-selected active:bg-selected',
  destructive: 'bg-red-tint text-red border border-red-line hover:brightness-125 active:brightness-95',
  ghost:
    'bg-transparent text-ink-secondary border border-transparent hover:text-ink hover:bg-elevated',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Renders the success state (label swap is the caller's job). */
  success?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  success = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      data-state={loading ? 'loading' : success ? 'success' : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-[6px] font-medium transition-[background-color,border-color,filter,color] duration-100 disabled:cursor-not-allowed disabled:opacity-45 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden
          className="cs-spin h-3.5 w-3.5 rounded-full border-[1.5px] border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** 28px square icon control. */
export function IconButton({ label, className = '', children, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-transparent text-ink-secondary transition hover:border-line hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}
