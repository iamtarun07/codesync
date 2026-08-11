import type { ReactNode } from 'react';
import { Brand } from '../components/common/Brand';

interface AuthLayoutProps {
  eyebrow: string;
  eyebrowTone?: 'cyan' | 'lime';
  headline: ReactNode;
  blurb: string;
  /** Terminal log or stat strip pinned to the bottom of the hero. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Split screen: a grid-ruled hero on the left, the form on the right.
 * The grid is drawn with 1px solid lines, not a gradient or a blur.
 */
export function AuthLayout({
  eyebrow,
  eyebrowTone = 'cyan',
  headline,
  blurb,
  aside,
  children,
}: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.35fr_1fr]">
      <section className="cs-grid relative hidden flex-col justify-between border-r border-line p-10 lg:flex">
        <Brand />

        <div className="max-w-xl">
          <p
            className={`t-label mb-5 ${eyebrowTone === 'cyan' ? 'text-cyan' : 'text-lime'}`}
          >
            {eyebrow}
          </p>
          <h1 className="text-[46px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
            {headline}
          </h1>
          <p className="mt-5 max-w-md text-[13.5px] leading-relaxed text-ink-secondary">{blurb}</p>
        </div>

        <div>{aside}</div>
      </section>

      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

/** Fake-free session log: shows real client-side facts about this build. */
export function SessionLog({ lines }: { lines: { tag: string; tone: string; text: ReactNode }[] }) {
  return (
    <div className="max-w-lg rounded-[8px] border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="t-label">Session log</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-lime" />
          <span className="t-meta">live</span>
        </span>
      </div>
      <div className="space-y-1.5 px-3 py-3 font-mono text-[11.5px] leading-relaxed">
        {lines.map((line, index) => (
          <p key={index} className="flex gap-2">
            <span className={line.tone}>{line.tag}</span>
            <span className="text-ink-secondary">{line.text}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function StatStrip({ items }: { items: { value: string; unit?: string; label: string }[] }) {
  return (
    <div className="flex max-w-lg divide-x divide-[var(--cs-border)] rounded-[8px] border border-line bg-surface">
      {items.map((item) => (
        <div key={item.label} className="flex-1 px-4 py-3">
          <p className="font-mono text-[20px] font-semibold text-cyan">
            {item.value}
            {item.unit ? (
              <span className="ml-0.5 text-[11px] text-ink-muted">{item.unit}</span>
            ) : null}
          </p>
          <p className="t-label mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
