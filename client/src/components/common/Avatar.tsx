import { accentForUser, initials } from '../../utils/format';

interface AvatarProps {
  userId: string;
  username: string;
  size?: number;
  /** Dim the avatar for offline peers. */
  muted?: boolean;
  className?: string;
}

/**
 * 5px-rounded square, never a circle — only status dots are round.
 * The fill is the user's accent hue at low lightness with a solid hue border.
 */
export function Avatar({ userId, username, size = 24, muted = false, className = '' }: AvatarProps) {
  const accent = accentForUser(userId);
  return (
    <span
      title={username}
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        backgroundColor: accent.color,
        color: accent.contrast,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        opacity: muted ? 0.4 : 1,
      }}
      className={`inline-flex shrink-0 items-center justify-center font-mono font-semibold ${className}`}
    >
      {initials(username)}
    </span>
  );
}

/** Overlapping stack used in the rooms table. */
export function AvatarStack({
  members,
  max = 3,
}: {
  members: { userId: string; username: string }[];
  max?: number;
}) {
  const shown = members.slice(0, max);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex">
        {shown.map((member, index) => (
          <Avatar
            key={member.userId}
            userId={member.userId}
            username={member.username}
            size={20}
            className={index > 0 ? '-ml-1.5 ring-1 ring-surface' : ''}
          />
        ))}
      </span>
      <span className="t-meta">{members.length}</span>
    </span>
  );
}
