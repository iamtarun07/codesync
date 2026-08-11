import { useEffect, useState } from 'react';
import type { RoomSettings } from '../../types';
import { Alert } from '../common/Alert';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';

interface RoomSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: RoomSettings;
  saving: boolean;
  error: string | null;
  onSave: (patch: {
    name?: string;
    isPublic?: boolean;
    password?: { enabled: boolean; value?: string };
  }) => void;
}

/** Owner-only. Everything here is enforced again on the server. */
export function RoomSettingsModal({
  open,
  onClose,
  settings,
  saving,
  error,
  onSave,
}: RoomSettingsModalProps) {
  const [name, setName] = useState(settings.name);
  const [isPublic, setIsPublic] = useState(settings.isPublic);
  const [passwordOn, setPasswordOn] = useState(settings.passwordEnabled);
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Re-seed the form whenever the dialog opens on fresh settings.
  useEffect(() => {
    if (!open) return;
    setName(settings.name);
    setIsPublic(settings.isPublic);
    setPasswordOn(settings.passwordEnabled);
    setPassword('');
    setLocalError(null);
  }, [open, settings]);

  const submit = () => {
    const patch: Parameters<typeof onSave>[0] = {};
    if (name.trim() && name.trim() !== settings.name) patch.name = name.trim();
    if (isPublic !== settings.isPublic) patch.isPublic = isPublic;

    if (passwordOn && (password.length > 0 || !settings.passwordEnabled)) {
      if (password.length < 4) {
        setLocalError('Choose a password of at least 4 characters');
        return;
      }
      patch.password = { enabled: true, value: password };
    } else if (!passwordOn && settings.passwordEnabled) {
      patch.password = { enabled: false };
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setLocalError(null);
    onSave(patch);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Room settings"
      subtitle="Owner only"
      width={460}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error || localError ? <Alert>{localError ?? error}</Alert> : null}

        <Input
          label="Room name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />

        <div className="space-y-2">
          <p className="t-label">Access</p>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[6px] border border-line bg-elevated px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] text-ink">Anyone with the room ID can join</span>
              <span className="t-caption">Turn off to keep the room to its current members.</span>
            </span>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-[var(--cs-cyan)]"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[6px] border border-line bg-elevated px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] text-ink">Password protection</span>
              <span className="t-caption">
                {settings.passwordEnabled
                  ? 'On — leave the field blank to keep the current password.'
                  : 'Off — collaborators join without a password.'}
              </span>
            </span>
            <input
              type="checkbox"
              checked={passwordOn}
              onChange={(event) => setPasswordOn(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-[var(--cs-cyan)]"
            />
          </label>

          {passwordOn ? (
            <Input
              label="Password"
              type="password"
              value={password}
              autoComplete="new-password"
              placeholder={settings.passwordEnabled ? '•••••••• (unchanged)' : '••••••••'}
              hint="Stored as a bcrypt hash. Setting a new one asks every member again."
              onChange={(event) => setPassword(event.target.value)}
            />
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
