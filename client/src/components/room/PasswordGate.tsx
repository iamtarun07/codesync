import { useState, type FormEvent } from 'react';
import { Alert } from '../common/Alert';
import { Brand } from '../common/Brand';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

interface PasswordGateProps {
  roomId: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

/** Shown when the server answers PASSWORD_REQUIRED. No room data is loaded yet. */
export function PasswordGate({
  roomId,
  submitting,
  error,
  onSubmit,
  onCancel,
}: PasswordGateProps) {
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length === 0) return;
    onSubmit(password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[380px] space-y-5 rounded-[8px] border border-line bg-surface p-6">
        <div className="flex items-center gap-2">
          <Brand size={22} withWordmark={false} />
          <span className="t-label">Protected room</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-[16px] font-semibold text-ink">Password required</h1>
          <p className="t-caption">
            Room{' '}
            <span className="font-mono tracking-[0.08em] text-cyan">{roomId}</span> is protected by
            its owner.
          </p>
        </div>

        {error ? <Alert>{error}</Alert> : null}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="Room password"
            type="password"
            value={password}
            autoComplete="off"
            placeholder="••••••••"
            onChange={(event) => setPassword(event.target.value)}
          />

          <div className="flex gap-2">
            <Button type="submit" loading={submitting} className="flex-1">
              {submitting ? 'Checking…' : 'Enter room'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Back
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
