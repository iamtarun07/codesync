interface BrandProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * Mark: a 5px-rounded square holding two offset blocks — the two buffers of a
 * shared document. Cyan is the primary block, lime the peer.
 */
export function Brand({ size = 26, withWordmark = true, className = '' }: BrandProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        style={{ width: size, height: size, borderRadius: 6 }}
        className="relative inline-block shrink-0 border border-cyan-line bg-cyan-tint"
      >
        <span
          style={{ width: size * 0.3, height: size * 0.3, top: size * 0.2, left: size * 0.2 }}
          className="absolute rounded-[2px] bg-cyan"
        />
        <span
          style={{ width: size * 0.24, height: size * 0.24, bottom: size * 0.2, right: size * 0.2 }}
          className="absolute rounded-[2px] bg-lime"
        />
      </span>
      {withWordmark ? (
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">CodeSync</span>
      ) : null}
    </span>
  );
}
