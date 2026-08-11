import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { Alert } from '../components/common/Alert';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { clearAuthError, register } from '../features/auth/authSlice';
import { AuthLayout, StatStrip } from '../layouts/AuthLayout';
import { LANGUAGES } from '../utils/languages';

interface FieldErrors {
  username?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

const STRENGTH_LABELS = ['too short', 'weak', 'fair', 'good', 'strong'];
const STRENGTH_TONES = [
  'bg-ink-disabled',
  'bg-red',
  'bg-amber',
  'bg-lime',
  'bg-lime',
];

function scorePassword(value: string): number {
  if (value.length < 8) return 0;
  let score = 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

export function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { submitting, error } = useAppSelector((state) => state.auth);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const strength = useMemo(() => scorePassword(password), [password]);

  useEffect(() => () => void dispatch(clearAuthError()), [dispatch]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: FieldErrors = {};
    if (username.trim().length < 3) errors.username = 'at least 3 characters';
    if (username.trim().length > 30) errors.username = 'at most 30 characters';
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'enter a valid email address';
    if (password.length < 8) errors.password = 'at least 8 characters';
    if (password !== confirm) errors.confirm = 'passwords do not match';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const result = await dispatch(register({ username: username.trim(), email, password }));
    if (register.fulfilled.match(result)) {
      // An invite link that hit the signup page still lands in the room.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/dashboard', { replace: true });
    }
  };

  return (
    <AuthLayout
      eyebrow="Free · no card required"
      eyebrowTone="lime"
      headline={
        <>
          Set up your
          <br />
          workstation.
        </>
      }
      blurb="Unlimited rooms, live cursors, room chat, and in-editor execution — all persisted so you can pick a session back up tomorrow."
      aside={
        <StatStrip
          items={[
            { value: '3', unit: 's', label: 'Autosave' },
            { value: String(LANGUAGES.length), label: 'Languages' },
            { value: '∞', label: 'Rooms' },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="t-screen-title">Create account</h1>
          <p className="t-caption">Takes about twenty seconds.</p>
        </div>

        {error ? <Alert onDismiss={() => dispatch(clearAuthError())}>{error}</Alert> : null}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="Username"
            autoComplete="username"
            value={username}
            error={fieldErrors.username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="ada"
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.dev"
          />

          <div className="space-y-2">
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              error={fieldErrors.password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="at least 8 characters"
            />
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={`h-[3px] flex-1 rounded-full transition-colors ${
                      password.length > 0 && index < strength
                        ? STRENGTH_TONES[strength]
                        : 'bg-line'
                    }`}
                  />
                ))}
              </div>
              <span className="t-meta w-16 text-right">
                {password.length > 0 ? STRENGTH_LABELS[strength] : ''}
              </span>
            </div>
          </div>

          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={fieldErrors.confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="••••••••••••"
          />

          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Creating…' : 'Create account'}
          </Button>
        </form>

        <p className="t-caption">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-cyan hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
