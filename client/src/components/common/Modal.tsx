import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line under the title. */
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/**
 * Opaque dialog on a dimmed page. No blur, no translucent panel — the surface
 * ramp and a hairline border carry the elevation, same as every other surface.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 420,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    // Focus the first control so the dialog is usable from the keyboard.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, button, select, textarea',
    );
    focusable?.focus();

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="relative max-h-[85vh] w-full overflow-y-auto rounded-[8px] border border-line bg-surface"
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="t-caption mt-0.5">{subtitle}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        </header>

        <div className="px-4 py-4">{children}</div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
