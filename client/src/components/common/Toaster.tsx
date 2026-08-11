import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { dismissToast } from '../../features/ui/uiSlice';

const AUTO_DISMISS_MS = 2600;

const TONES = {
  neutral: 'border-line bg-elevated text-ink',
  success: 'border-lime-line bg-lime-tint text-lime',
  error: 'border-red-line bg-red-tint text-red',
} as const;

/** Bottom-right, 2.6s auto-dismiss, 200ms slide from the right, one at a time. */
export function Toaster() {
  const toast = useAppSelector((state) => state.ui.toast);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dispatch(dismissToast()), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dispatch]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50">
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        className={`cs-slide-in pointer-events-auto flex items-center gap-3 rounded-[8px] border px-3 py-2 ${TONES[toast.tone]}`}
      >
        <span className="text-[13px] font-medium">{toast.title}</span>
        {toast.detail ? (
          <span className="font-mono text-[11px] opacity-70">{toast.detail}</span>
        ) : null}
      </div>
    </div>
  );
}
