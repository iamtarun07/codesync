/**
 * Cursor and avatar colours come from the accent set, assigned in join order —
 * never random. Cyan is reserved for "you", so peers start at index 1.
 */
export const ACCENT_HUES = [
  { name: 'cyan', color: '#22d3ee', contrast: '#04191c' },
  { name: 'lime', color: '#a3e635', contrast: '#141a0e' },
  { name: 'amber', color: '#f0b429', contrast: '#1c1608' },
  { name: 'red', color: '#ef4b4b', contrast: '#1a1214' },
  { name: 'violet', color: '#8b9dff', contrast: '#0d1230' },
  { name: 'teal', color: '#2dd4bf', contrast: '#04201c' },
] as const;

export interface AccentHue {
  color: string;
  contrast: string;
}

/** Deterministic per-user hue so a collaborator keeps the same colour. */
export function accentForUser(userId: string): AccentHue {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return ACCENT_HUES[hash % ACCENT_HUES.length];
}

export function colorForUser(userId: string): string {
  return accentForUser(userId).color;
}

/** Selection fill: the owner's hue at 22% lightness — solid, not alpha. */
export function selectionFill(hex: string): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const mix = (channel: number) => Math.round(channel * 0.22);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** mm ss uptime for the session metrics panel. */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
