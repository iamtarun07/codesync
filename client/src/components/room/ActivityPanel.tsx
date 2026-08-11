import type { ActivityEntry, ActivityGroup, ActivityType } from '../../types';
import { languageLabel } from '../../utils/languages';

interface ActivityPanelProps {
  entries: ActivityEntry[];
  group: ActivityGroup;
  onGroupChange: (group: ActivityGroup) => void;
}

const GROUPS: { id: ActivityGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'files', label: 'Files' },
  { id: 'members', label: 'Members' },
  { id: 'settings', label: 'Settings' },
];

const TONE: Record<ActivityType, string> = {
  USER_JOINED: 'text-lime',
  USER_LEFT: 'text-ink-muted',
  FILE_CREATED: 'text-cyan',
  FILE_RENAMED: 'text-cyan',
  FILE_DELETED: 'text-red',
  LANGUAGE_CHANGED: 'text-amber',
  CODE_SAVED: 'text-ink-secondary',
  CODE_RUN: 'text-amber',
  ROLE_CHANGED: 'text-amber',
  ROOM_SETTINGS_CHANGED: 'text-amber',
  PASSWORD_ENABLED: 'text-amber',
  PASSWORD_DISABLED: 'text-ink-secondary',
};

/** One readable sentence per event. Metadata is always small labels. */
function describe(entry: ActivityEntry): string {
  const meta = entry.metadata ?? {};
  switch (entry.type) {
    case 'USER_JOINED':
      return `joined the workspace${meta.role ? ` as ${meta.role}` : ''}`;
    case 'USER_LEFT':
      return 'left the workspace';
    case 'FILE_CREATED':
      return `created ${meta.type === 'folder' ? 'folder ' : ''}${meta.path ?? 'a file'}`;
    case 'FILE_RENAMED':
      return `renamed ${meta.from ?? '?'} to ${meta.to ?? '?'}`;
    case 'FILE_DELETED':
      return `deleted ${meta.type === 'folder' ? 'folder ' : ''}${meta.path ?? 'a file'}`;
    case 'LANGUAGE_CHANGED':
      return `set ${meta.path ?? 'the file'} to ${languageLabel(meta.language ?? '')}`;
    case 'CODE_SAVED':
      return `saved ${meta.path ?? 'changes'}`;
    case 'CODE_RUN':
      return `ran ${meta.path ?? 'the file'}`;
    case 'ROLE_CHANGED':
      return `changed a role from ${meta.from ?? '?'} to ${meta.to ?? '?'}`;
    case 'ROOM_SETTINGS_CHANGED':
      return meta.name
        ? `renamed the room to ${meta.name}`
        : `set access to ${meta.access ?? 'updated'}`;
    case 'PASSWORD_ENABLED':
      return 'enabled password protection';
    case 'PASSWORD_DISABLED':
      return 'disabled password protection';
  }
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ActivityPanel({ entries, group, onGroupChange }: ActivityPanelProps) {
  return (
    <section className="flex min-h-0 flex-col border-b border-line">
      <header className="flex h-9 shrink-0 items-center justify-between px-3">
        <h2 className="t-label">Activity</h2>
        <span className="t-meta">{entries.length}</span>
      </header>

      <div className="flex shrink-0 gap-1 px-3 pb-2">
        {GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onGroupChange(item.id)}
            className={`rounded-[4px] border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] transition ${
              group === item.id
                ? 'border-cyan-line bg-cyan-tint text-cyan'
                : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="px-3 pb-3 text-[12px] text-ink-muted">Nothing recorded yet.</p>
      ) : (
        <ul className="max-h-56 min-h-0 overflow-y-auto pb-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-2 px-3 py-1.5">
              <span className="t-meta w-[52px] shrink-0 pt-[1px] tabular-nums">
                {clockTime(entry.createdAt)}
              </span>
              <span className="min-w-0 text-[12.5px] leading-snug">
                <span className="font-medium text-ink">{entry.actor.username}</span>{' '}
                <span className={TONE[entry.type] ?? 'text-ink-secondary'}>{describe(entry)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
