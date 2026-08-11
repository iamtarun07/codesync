import { useEffect, useState } from 'react';
import type { RoomMemberView, RoomRole } from '../../types';
import { Avatar } from '../common/Avatar';
import { Badge } from '../common/Badge';
import { Dot } from '../common/StatusDot';

interface CollaboratorsPanelProps {
  members: RoomMemberView[];
  currentUserId?: string;
  /** Live cursor lines keyed by username, from Yjs awareness. */
  activity: Record<string, string>;
  /** Only the owner may open the role menu. */
  canManageRoles: boolean;
  onRoleChange: (userId: string, role: Exclude<RoomRole, 'owner'>) => void;
}

const ROLE_TONE: Record<RoomRole, 'cyan' | 'lime' | 'neutral'> = {
  owner: 'cyan',
  editor: 'lime',
  viewer: 'neutral',
};

export function CollaboratorsPanel({
  members,
  currentUserId,
  activity,
  canManageRoles,
  onRoleChange,
}: CollaboratorsPanelProps) {
  const online = members.filter((member) => member.online).length;
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const dismiss = () => setMenuFor(null);
    window.addEventListener('click', dismiss);
    return () => window.removeEventListener('click', dismiss);
  }, [menuFor]);

  return (
    <section className="border-b border-line">
      <header className="flex h-9 items-center justify-between px-3">
        <h2 className="t-label">Collaborators</h2>
        <span className="t-meta">
          {online}/{members.length}
        </span>
      </header>

      {members.length === 0 ? (
        <p className="px-3 pb-3 text-[12px] text-ink-muted">No members yet.</p>
      ) : (
        <ul className="max-h-52 overflow-y-auto pb-1">
          {members.map((member) => {
            const isYou = member.userId === currentUserId;
            const status = member.online
              ? member.role === 'viewer'
                ? 'viewing'
                : (activity[member.username] ?? 'editing')
              : 'offline';
            // The owner cannot demote themselves out of their own room.
            const manageable = canManageRoles && member.role !== 'owner';

            return (
              <li
                key={member.userId}
                className="relative flex items-center gap-2.5 border-l-2 border-transparent px-3 py-1.5 transition-colors hover:bg-elevated"
              >
                <Avatar
                  userId={member.userId}
                  username={member.username}
                  size={26}
                  muted={!member.online}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-[13px] font-medium ${
                        member.online ? 'text-ink' : 'text-ink-muted'
                      }`}
                    >
                      {member.username}
                    </span>
                    {isYou ? <Badge tone="cyan">you</Badge> : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <Dot tone={member.online ? 'lime' : 'muted'} />
                    <span className="t-meta truncate">{status}</span>
                  </span>
                </span>

                {manageable ? (
                  <button
                    type="button"
                    title="Change role"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuFor((current) => (current === member.userId ? null : member.userId));
                    }}
                    className="shrink-0"
                  >
                    <Badge tone={ROLE_TONE[member.role]}>{member.role} ⌄</Badge>
                  </button>
                ) : (
                  <Badge tone={ROLE_TONE[member.role]} className="shrink-0">
                    {member.role}
                  </Badge>
                )}

                {menuFor === member.userId ? (
                  <div
                    role="menu"
                    className="absolute right-2 top-[calc(100%-6px)] z-30 w-32 overflow-hidden rounded-[6px] border border-line bg-elevated py-1"
                  >
                    <p className="t-meta px-3 pb-1">Change role</p>
                    {(['editor', 'viewer'] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        role="menuitem"
                        disabled={role === member.role}
                        onClick={() => {
                          setMenuFor(null);
                          onRoleChange(member.userId, role);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-[12.5px] text-ink-secondary transition-colors hover:bg-selected hover:text-ink disabled:opacity-40"
                      >
                        {role}
                        {role === member.role ? ' ✓' : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
