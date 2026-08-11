import { useState } from 'react';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
  passwordEnabled: boolean;
}

/** The link a collaborator can actually paste into a browser. */
export function inviteLink(roomId: string): string {
  return `${window.location.origin}/room/${roomId}`;
}

export function ShareModal({
  open,
  onClose,
  roomId,
  roomName,
  passwordEnabled,
}: ShareModalProps) {
  const [copied, setCopied] = useState<'id' | 'link' | null>(null);
  const [failed, setFailed] = useState(false);

  const copy = async (value: string, what: 'id' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setFailed(true);
    }
  };

  const link = inviteLink(roomId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share workspace"
      subtitle={roomName}
      width={460}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <p className="t-label">Room ID</p>
          <div className="flex items-center gap-2">
            <code className="flex h-9 flex-1 items-center rounded-[6px] border border-line bg-elevated px-3 font-mono text-[13px] tracking-[0.12em] text-cyan">
              {roomId}
            </code>
            <Button size="sm" variant="secondary" onClick={() => void copy(roomId, 'id')}>
              {copied === 'id' ? '✓ Copied' : 'Copy ID'}
            </Button>
          </div>
          <p className="t-caption">Collaborators can paste this into “Join room”.</p>
        </div>

        <div className="space-y-1.5">
          <p className="t-label">Invite link</p>
          <div className="flex items-center gap-2">
            <code className="flex h-9 min-w-0 flex-1 items-center truncate rounded-[6px] border border-line bg-elevated px-3 font-mono text-[12px] text-ink-secondary">
              {link}
            </code>
            <Button size="sm" onClick={() => void copy(link, 'link')}>
              {copied === 'link' ? '✓ Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="t-caption">
            Signed-out visitors land on the login page and are returned here afterwards.
          </p>
        </div>

        {passwordEnabled ? (
          <p className="rounded-[6px] border border-amber-line bg-amber-tint px-3 py-2 text-[12.5px] text-amber">
            This room is password protected — share the password separately.
          </p>
        ) : null}

        {failed ? (
          <p className="text-[12.5px] text-red">
            The browser blocked clipboard access — select the text and copy manually.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
