import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppDispatch } from './app/hooks';
import { Toaster } from './components/common/Toaster';
import { fetchMe } from './features/auth/authSlice';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegisterPage } from './pages/RegisterPage';
import { RoomPage } from './pages/RoomPage';
import { ProtectedRoute, PublicOnlyRoute } from './routes/ProtectedRoute';

export default function App() {
  const dispatch = useAppDispatch();

  // Session rehydration: the JWT is in an httpOnly cookie, so the only way to
  // know who we are is to ask the server once on boot.
  useEffect(() => {
    void dispatch(fetchMe());
  }, [dispatch]);

  return (
    <>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <Toaster />
    </>
  );
}
