import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { FullPageSpinner } from '../components/common/Spinner';

export function ProtectedRoute() {
  const status = useAppSelector((state) => state.auth.status);
  const location = useLocation();

  // Wait for the /me rehydration before deciding — otherwise a refresh would
  // bounce an authenticated user to the login page.
  if (status === 'idle' || status === 'loading') return <FullPageSpinner label="Signing you in…" />;
  if (status !== 'authenticated') {
    // Keep the whole intended location (invite links carry the room path) so
    // signing in returns the visitor to the room they clicked.
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const status = useAppSelector((state) => state.auth.status);

  if (status === 'idle' || status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
