import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessage } from '../../types';
import { accentForUser, formatTime } from '../../utils/format';
import { Spinner } from '../common/Spinner';

interface ChatPanelProps {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  currentUserId?: string;
  disabled: boolean;
  onSend: (text: string) => void;
}

const MAX_LENGTH = 2000;

export function ChatPanel({
  messages,
  loading,
  error,
  currentUserId,
  disabled,
  onSend,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed.slice(0, MAX_LENGTH));
    setText('');
  };

  // ↵ send · ⇧↵ newline
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between px-3">
        <h2 className="t-label">Chat</h2>
        <span className="t-meta">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="pt-6 text-center text-ink-muted">
            <Spinner label="loading history" />
          </div>
        ) : null}

        {error ? <p className="text-[12px] text-red">{error}</p> : null}

        {!loading && !error && messages.length === 0 ? (
          <p className="pt-8 text-center text-[12px] text-ink-muted">
            No messages yet. Chat lives next to the code it is about.
          </p>
        ) : null}

        {messages.map((message) => {
          const mine = message.sender.id === currentUserId;
          const accent = accentForUser(message.sender.id);

          return (
            <div key={message.id} className={mine ? 'flex flex-col items-end' : 'flex flex-col'}>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono text-[11px] font-semibold"
                  style={{ color: mine ? undefined : accent.color }}
                >
                  <span className={mine ? 'text-cyan' : ''}>
                    {mine ? 'you' : message.sender.username}
                  </span>
                </span>
                <time className="t-meta">{formatTime(message.createdAt)}</time>
              </div>

              <p
                className={`mt-1 max-w-[92%] whitespace-pre-wrap break-words rounded-[6px] border px-2.5 py-1.5 text-[13px] ${
                  mine
                    ? 'border-cyan-line bg-cyan-tint text-ink'
                    : 'border-line bg-elevated text-ink'
                }`}
              >
                {message.text}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-line p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            rows={1}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_LENGTH}
            disabled={disabled}
            placeholder={disabled ? 'reconnecting…' : 'Message the room…'}
            aria-label="Chat message"
            className="max-h-24 min-h-9 w-full flex-1 resize-none rounded-[6px] border border-line bg-elevated px-2.5 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-disabled focus:border-cyan disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || text.trim().length === 0}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-line bg-elevated text-ink-secondary transition hover:border-cyan hover:text-cyan disabled:opacity-35 disabled:hover:border-line disabled:hover:text-ink-secondary"
          >
            ↵
          </button>
        </div>
        <p className="t-meta mt-1.5 px-0.5">↵ send · ⇧↵ newline</p>
      </form>
    </section>
  );
}
