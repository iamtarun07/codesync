import { useNavigate } from 'react-router-dom';
import type { Room } from '../../types';
import { formatRelative } from '../../utils/format';
import { languageLabel, languageTag } from '../../utils/languages';
import { AvatarStack } from '../common/Avatar';
import { Dot } from '../common/StatusDot';

interface RoomTableProps {
  rooms: Room[];
  currentUserId?: string;
  onDelete: (roomId: string) => void;
}

/**
 * Rooms are a table, not cards: alignment and column rhythm carry the
 * hierarchy. The active row gets a cyan left rule — no shadow, no gradient.
 */
export function RoomTable({ rooms, currentUserId, onDelete }: RoomTableProps) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-[8px] border border-line bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {['Room', 'Room ID', 'Language', 'Members', 'Last activity', 'Status'].map((head) => (
              <th key={head} className="t-label px-4 py-2.5 font-medium">
                {head}
              </th>
            ))}
            <th className="w-10 px-2" aria-label="Actions" />
          </tr>
        </thead>

        <tbody>
          {rooms.map((room) => {
            const isOwner = room.owner.id === currentUserId;
            const members = room.members.map((member) => ({
              userId: member.user.id,
              username: member.user.username,
            }));

            return (
              <tr
                key={room.roomId}
                onClick={() => navigate(`/room/${room.roomId}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.target === event.currentTarget) {
                    navigate(`/room/${room.roomId}`);
                  }
                }}
                tabIndex={0}
                aria-label={`Open room ${room.name}`}
                className="group cursor-pointer border-b border-line/70 border-l-2 border-l-transparent transition-colors last:border-b-0 hover:border-l-cyan hover:bg-elevated focus-visible:border-l-cyan focus-visible:bg-elevated focus-visible:outline-none"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] border border-line bg-elevated font-mono text-[9.5px] font-semibold text-ink-secondary">
                      {languageTag(room.language)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {room.name}
                      </span>
                      <span className="t-meta">{isOwner ? 'you · owner' : room.owner.username}</span>
                    </span>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span className="font-mono text-[12px] tracking-[0.08em] text-cyan">
                    {room.roomId}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-[4px] border border-line bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">
                    {languageLabel(room.language)}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <AvatarStack members={members} />
                </td>

                <td className="t-meta px-4 py-3">{formatRelative(room.updatedAt)}</td>

                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Dot tone={room.isPublic ? 'lime' : 'muted'} />
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-muted">
                      {room.isPublic ? 'public' : 'private'}
                    </span>
                  </span>
                </td>

                <td className="px-2 py-3 text-right">
                  {isOwner ? (
                    <button
                      type="button"
                      aria-label={`Delete room ${room.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(room.roomId);
                      }}
                      className="rounded-[4px] px-1.5 py-1 text-[12px] text-ink-disabled opacity-0 transition group-hover:opacity-100 hover:bg-red-tint hover:text-red focus-visible:opacity-100"
                    >
                      ✕
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
