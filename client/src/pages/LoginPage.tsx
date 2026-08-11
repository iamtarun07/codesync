import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { Alert } from '../components/common/Alert';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { clearAuthError, login } from '../features/auth/authSlice';
import { AuthLayout, SessionLog } from '../layouts/AuthLayout';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { submitting, error } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => () => void dispatch(clearAuthError()), [dispatch]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: typeof fieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'enter a valid email address';
    if (password.length < 1) errors.password = 'password is required';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const result = await dispatch(login({ email, password }));
    if (login.fulfilled.match(result)) {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/dashboard', { replace: true });
    }
  };

  return (
    <AuthLayout
      eyebrow="Real-time collaborative editor"
      headline={
        <>
          Two engineers.
          <br />
          One buffer.
          <br />
          Zero merge conflicts.
        </>
      }
      blurb="Shared rooms with CRDT-backed sync, live cursors and presence, and chat that lives next to the code it is about."
      aside={
        <SessionLog
          lines={[
            {
              tag: 'crdt',
              tone: 'text-cyan',
              text: 'yjs document · convergent, offline-safe merges',
            },
            { tag: 'ws', tone: 'text-lime', text: 'socket.io transport · jwt handshake' },
            { tag: 'db', tone: 'text-amber', text: 'mongodb persistence · 3s debounce' },
            { tag: 'ws', tone: 'text-lime', text: 'awaiting auth_' },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="t-screen-title">Sign in</h1>
          <p className="t-caption">Authenticate to reconnect to your workspaces.</p>
        </div>

        {error ? <Alert onDismiss={() => dispatch(clearAuthError())}>{error}</Alert> : null}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.dev"
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            error={fieldErrors.password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••••"
            action={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="t-label transition hover:text-ink"
              >
                {showPassword ? 'hide' : 'show'}
              </button>
            }
          />

          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="t-caption">
          No account yet?{' '}
          <Link to="/register" className="font-medium text-cyan hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
