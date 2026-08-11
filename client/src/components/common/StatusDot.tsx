import type { ConnectionStatus } from '../../types';

type Tone = 'lime' | 'amber' | 'red' | 'muted' | 'cyan';

const TONE_CLASS: Record<Tone, string> = {
  lime: 'bg-lime',
  amber: 'bg-amber',
  red: 'bg-red',
  cyan: 'bg-cyan',
  muted: 'bg-ink-disabled',
};

/** The only round shape in the system. */
export function Dot({
  tone,
  pulse,
  className = '',
}: {
  tone: Tone;
  pulse?: 'slow' | 'fast';
  className?: string;
}) {
  const animation = pulse === 'fast' ? 'cs-pulse-fast' : pulse === 'slow' ? 'cs-pulse-slow' : '';
  return (
    <span
      aria-hidden
      className={`inline-block h-[6px] w-[6px] shrink-0 rounded-full ${TONE_CLASS[tone]} ${animation} ${className}`}
    />
  );
}

/**
 * Connection language, straight from the spec:
 *   connected    — solid dot, no motion
 *   connecting   — 1.1s pulse
 *   reconnecting — 700ms pulse, faster reads as urgent
 *   disconnected — red, paired with the reconnect banner
 */
const CONNECTION: Record<
  ConnectionStatus,
  { label: string; tone: Tone; pulse?: 'slow' | 'fast'; text: string }
> = {
  idle: { label: 'Offline', tone: 'muted', text: 'text-ink-muted' },
  connecting: { label: 'Connecting', tone: 'amber', pulse: 'slow', text: 'text-amber' },
  connected: { label: 'Connected', tone: 'lime', text: 'text-lime' },
  disconnected: { label: 'Reconnecting', tone: 'red', pulse: 'fast', text: 'text-red' },
};

export function ConnectionBadge({
  status,
  compact = false,
}: {
  status: ConnectionStatus;
  compact?: boolean;
}) {
  const state = CONNECTION[status];

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${state.text}`}>
        <Dot tone={state.tone} pulse={state.pulse} />
        <span className="t-meta font-medium text-current">{state.label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[4px] border px-2 py-1 ${state.text} ${
        status === 'connected'
          ? 'border-lime-line bg-lime-tint'
          : status === 'connecting'
            ? 'border-amber-line bg-amber-tint'
            : status === 'disconnected'
              ? 'border-red-line bg-red-tint'
              : 'border-line bg-elevated'
      }`}
    >
      <Dot tone={state.tone} pulse={state.pulse} />
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em]">
        {state.label}
      </span>
    </span>
  );
}
