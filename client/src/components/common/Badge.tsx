import type { ReactNode } from 'react';

type Tone = 'neutral' | 'cyan' | 'lime' | 'amber' | 'red';

const TONES: Record<Tone, string> = {
  neutral: 'bg-elevated text-ink-secondary border-line',
  cyan: 'bg-cyan-tint text-cyan border-cyan-line',
  lime: 'bg-lime-tint text-lime border-lime-line',
  amber: 'bg-amber-tint text-amber border-amber-line',
  red: 'bg-red-tint text-red border-red-line',
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/** Chip radius (4px), mono, uppercase. Never a pill. */
export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Room IDs are always cyan mono — the design reserves that pairing for them. */
export function RoomIdChip({ roomId, className = '' }: { roomId: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border border-line bg-elevated px-1.5 py-0.5 font-mono text-[11px] tracking-[0.08em] text-cyan ${className}`}
    >
      {roomId}
    </span>
  );
}
