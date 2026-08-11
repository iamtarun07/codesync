import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { Avatar } from '../components/common/Avatar';
import { Brand } from '../components/common/Brand';
import { IconButton } from '../components/common/Button';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { logout } from '../features/auth/authSlice';
import { disconnectSocket } from '../services/socket';

interface AppShellProps {
  /** Breadcrumb trail, e.g. ['workspace', 'rooms']. */
  breadcrumb: string[];
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ breadcrumb, actions, children }: AppShellProps) {
  const user = useAppSelector((state) => state.auth.user);
  const roomCount = useAppSelector((state) => state.rooms.items.length);
  const dispatch = useAppDispatch();

  const signOut = () => {
    disconnectSocket();
    void dispatch(logout());
  };

  return (
    <div className="flex h-screen bg-bg">
      {/* Solid sidebar, hairline right border — never translucent. */}
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-14 items-center border-b border-line px-4">
          <Link to="/dashboard">
            <Brand />
          </Link>
        </div>

        <nav className="flex-1 px-2 py-4">
          <p className="t-label px-2 pb-2">Workspace</p>
          <Link
            to="/dashboard"
            className="flex items-center justify-between rounded-[6px] border-l-2 border-cyan bg-selected px-2.5 py-2 text-[13px] font-medium text-ink"
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="h-3 w-3 rounded-[3px] border border-cyan bg-cyan-tint" />
              Rooms
            </span>
            <span className="t-meta">{roomCount}</span>
          </Link>
        </nav>

        <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
          {user ? <Avatar userId={user.id} username={user.username} size={28} /> : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">
              {user?.username}
            </span>
            <span className="t-meta truncate">{user?.email}</span>
          </span>
          <IconButton label="Log out" onClick={signOut}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none">
              <path
                d="M6 2H3v12h3M10 11l3-3-3-3M13 8H6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <Link to="/dashboard" className="md:hidden">
            <Brand withWordmark={false} size={24} />
          </Link>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-2 font-mono text-[11.5px]">
              {breadcrumb.map((crumb, index) => (
                <li key={crumb} className="flex items-center gap-2">
                  {index > 0 ? (
                    <span aria-hidden className="text-ink-disabled">
                      /
                    </span>
                  ) : null}
                  <span
                    className={
                      index === breadcrumb.length - 1
                        ? 'font-semibold text-ink'
                        : 'text-ink-muted'
                    }
                  >
                    {crumb}
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          <ThemeToggle />
          {actions}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
