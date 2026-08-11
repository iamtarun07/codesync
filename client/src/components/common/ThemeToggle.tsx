import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { toggleTheme } from '../../features/ui/uiSlice';
import { IconButton } from './Button';

export function ThemeToggle() {
  const theme = useAppSelector((state) => state.ui.theme);
  const dispatch = useAppDispatch();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <IconButton label={`Switch to ${next} theme`} onClick={() => dispatch(toggleTheme())}>
      {/* Half-filled circle: same structure re-toned, not two different icons. */}
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" />
      </svg>
    </IconButton>
  );
}
