import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Brand } from '../components/common/Brand';
import { Button, IconButton } from '../components/common/Button';
import { FullPageSpinner, Spinner } from '../components/common/Spinner';
import { ConnectionBadge, Dot } from '../components/common/StatusDot';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { ChatPanel } from '../components/chat/ChatPanel';
import { CodeEditor } from '../components/editor/CodeEditor';
import { LanguageSelect } from '../components/editor/LanguageSelect';
import { OutputPanel } from '../components/editor/OutputPanel';
import { RemoteCursorStyles } from '../components/editor/RemoteCursorStyles';
import { ActivityPanel } from '../components/room/ActivityPanel';
import { CollaboratorsPanel } from '../components/room/CollaboratorsPanel';
import { FileTree } from '../components/room/FileTree';
import { PasswordGate } from '../components/room/PasswordGate';
import { RoomSettingsModal } from '../components/room/RoomSettingsModal';
import { ShareModal } from '../components/room/ShareModal';
import { clearChat, fetchMessages } from '../features/chat/chatSlice';
import { useCollabSession } from '../features/editor/useCollabSession';
import { clearMembers } from '../features/presence/presenceSlice';
import {
  changeMemberRole,
  clearRun,
  fetchActivity,
  leaveRoom,
  openRoom,
  saveRoomSettings,
  setActiveFile,
  setActivityGroup,
  setLanguage,
  setSocketError,
  unlockRoom,
} from '../features/rooms/roomSlice';
import { showToast } from '../features/ui/uiSlice';
import { getSocket } from '../services/socket';
import { formatDuration } from '../utils/format';
import { isRunnable, languageLabel } from '../utils/languages';
import type { ActivityGroup, RoomRole } from '../types';

const ROLE_TONE: Record<RoomRole, 'cyan' | 'lime' | 'neutral'> = {
  owner: 'cyan',
  editor: 'lime',
  viewer: 'neutral',
};

export function RoomPage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const user = useAppSelector((state) => state.auth.user);
  const theme = useAppSelector((state) => state.ui.theme);
  const {
    room,
    language,
    files,
    activeFileId,
    myRole,
    settings,
    activity,
    activityGroup,
    status,
    error,
    unlockError,
    unlocking,
    savingSettings,
    settingsError,
    connection,
    lastSavedAt,
    socketError,
    run,
  } = useAppSelector((state) => state.room);
  const members = useAppSelector((state) => state.presence.members);
  const chat = useAppSelector((state) => state.chat);

  const [stdin, setStdin] = useState('');
  const [outputOpen, setOutputOpen] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [uptime, setUptime] = useState(0);
  const [savedRev, setSavedRev] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { ydoc, awareness, synced, remoteUsers, metrics } = useCollabSession(
    roomId,
    user,
    activeFileId,
  );

  const activeFile = files.find((file) => file.fileId === activeFileId) ?? null;
  const fileName = activeFile?.name ?? 'no file';
  const connected = connection === 'connected';
  const canEdit = myRole === 'owner' || myRole === 'editor';
  const isOwner = myRole === 'owner';
  const canRun = isRunnable(language) && connected && canEdit && run.status !== 'running';
  const dirty = savedRev !== null && metrics.rev > savedRev;

  useEffect(() => {
    void dispatch(openRoom(roomId));

    return () => {
      dispatch(leaveRoom());
      dispatch(clearMembers());
      dispatch(clearChat());
    };
  }, [dispatch, roomId]);

  // Chat and activity are only fetched once the room is actually accessible.
  useEffect(() => {
    if (status !== 'ready') return;
    void dispatch(fetchMessages(roomId));
  }, [dispatch, roomId, status]);

  useEffect(() => {
    if (status !== 'ready') return;
    void dispatch(fetchActivity({ roomId, group: activityGroup }));
  }, [dispatch, roomId, status, activityGroup]);

  // Each file tracks its own saved baseline for the dirty marker.
  useEffect(() => {
    setSavedRev(null);
    setSaving(false);
  }, [activeFileId]);

  useEffect(() => {
    if (synced && savedRev === null) setSavedRev(metrics.rev);
  }, [synced, savedRev, metrics.rev]);

  useEffect(() => {
    if (!lastSavedAt) return;
    setSavedRev(metrics.rev);
    setSaving(false);
    // metrics.rev is read at save-confirmation time only, not tracked.
  }, [lastSavedAt]);

  useEffect(() => {
    if (!metrics.connectedSince) return;
    const tick = () => setUptime(Date.now() - (metrics.connectedSince ?? Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [metrics.connectedSince]);

  const handleLanguage = useCallback(
    (next: string) => {
      if (!activeFileId) return;
      dispatch(setLanguage(next));
      getSocket().emit('room:language', { roomId, fileId: activeFileId, language: next });
    },
    [dispatch, roomId, activeFileId],
  );

  const handleSave = useCallback(() => {
    if (!activeFileId || !canEdit) return;
    setSaving(true);
    getSocket().emit('doc:save', { roomId, fileId: activeFileId });
  }, [roomId, activeFileId, canEdit]);

  const handleRun = useCallback(() => {
    if (!activeFileId) return;
    setOutputOpen(true);
    getSocket().emit('code:run', { roomId, fileId: activeFileId, stdin });
  }, [roomId, activeFileId, stdin]);

  const handleSend = useCallback(
    (text: string) => {
      getSocket().emit('chat:send', { roomId, text });
    },
    [roomId],
  );

  const handleCreate = useCallback(
    (path: string, type: 'file' | 'folder') => {
      getSocket().emit('file:create', { roomId, path, type });
    },
    [roomId],
  );

  const handleRename = useCallback(
    (fileId: string, name: string) => {
      getSocket().emit('file:rename', { roomId, fileId, name });
    },
    [roomId],
  );

  const handleDelete = useCallback(
    (fileId: string) => {
      getSocket().emit('file:delete', { roomId, fileId });
    },
    [roomId],
  );

  const handleRoleChange = useCallback(
    (userId: string, role: 'editor' | 'viewer') => {
      void dispatch(changeMemberRole({ roomId, userId, role }));
    },
    [dispatch, roomId],
  );

  // ⌘S / Ctrl+S saves, matching the shortcut shown on the button.
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** Awareness cursor lines, shown against each online collaborator. */
  const activityByUser = useMemo(() => {
    const map: Record<string, string> = {};
    remoteUsers.forEach((peer) => {
      map[peer.name] = 'editing';
    });
    if (user) map[user.username] = `editing · line ${cursor.line}`;
    return map;
  }, [remoteUsers, user, cursor.line]);

  if (status === 'locked') {
    return (
      <PasswordGate
        roomId={roomId}
        submitting={unlocking}
        error={unlockError}
        onSubmit={(password) => void dispatch(unlockRoom({ roomId, password }))}
        onCancel={() => navigate('/dashboard')}
      />
    );
  }

  if (status === 'loading' || status === 'idle') return <FullPageSpinner label="opening room" />;

  if (status === 'failed') {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="t-screen-title">Cannot open this room</h1>
        <Alert>{error ?? 'Unknown error'}</Alert>
        <div className="flex justify-center">
          <Button onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      <RemoteCursorStyles users={remoteUsers} />

      {/* ---- top bar ------------------------------------------------------ */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <button type="button" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
          <Brand size={24} withWordmark={false} />
        </button>

        <h1 className="max-w-[24ch] truncate text-[13.5px] font-semibold text-ink">{room?.name}</h1>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          title="Share workspace"
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-elevated px-1.5 py-1 font-mono text-[11px] tracking-[0.08em] text-cyan transition hover:border-cyan-line"
        >
          {roomId}
          <span aria-hidden className="text-ink-muted">
            ⧉
          </span>
        </button>

        {myRole ? <Badge tone={ROLE_TONE[myRole]}>{myRole}</Badge> : null}
        {settings?.passwordEnabled ? <Badge tone="amber">locked</Badge> : null}

        <ConnectionBadge status={connection} />

        <div className="flex-1" />

        <LanguageSelect
          value={language}
          onChange={handleLanguage}
          disabled={!connected || !canEdit || !activeFileId}
        />

        <Button size="sm" onClick={handleRun} loading={run.status === 'running'} disabled={!canRun}>
          ▶ Run
        </Button>

        {/* Saved is quiet; unsaved earns the cyan tint and shows its shortcut. */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!connected || !canEdit}
          className={`inline-flex h-7 items-center gap-2 rounded-[6px] border px-2.5 text-[12px] transition disabled:opacity-45 ${
            dirty
              ? 'border-cyan-line bg-cyan-tint text-cyan'
              : 'border-transparent text-ink-muted hover:border-line hover:bg-elevated'
          }`}
        >
          {saving ? <Spinner size={11} /> : null}
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          {dirty && !saving ? <span className="font-mono text-[10px] opacity-70">⌘S</span> : null}
        </button>

        {isOwner ? (
          <IconButton label="Room settings" onClick={() => setSettingsOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none">
              <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M8 1.6v1.7M8 12.7v1.7M2.9 2.9l1.2 1.2M11.9 11.9l1.2 1.2M1.6 8h1.7M12.7 8h1.7M2.9 13.1l1.2-1.2M11.9 4.1l1.2-1.2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        ) : null}

        <ThemeToggle />

        <IconButton label="Leave room" onClick={() => navigate('/dashboard')}>
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
      </header>

      {connection === 'disconnected' ? (
        <div className="shrink-0 border-b border-red-line bg-red-tint px-3 py-2">
          <div className="flex items-center gap-3 text-[13px] text-red">
            <span className="flex-1">
              Socket closed — your edits stay in the local CRDT and replay on reconnect.
            </span>
            <Button size="sm" variant="secondary" onClick={() => getSocket().connect()}>
              Reconnect
            </Button>
          </div>
        </div>
      ) : null}

      {myRole === 'viewer' ? (
        <div className="shrink-0 border-b border-line bg-elevated px-3 py-1.5 text-[12.5px] text-ink-secondary">
          View-only access — you can read, switch files, watch output and chat.
        </div>
      ) : null}

      {socketError ? (
        <div className="shrink-0 px-3 pt-2">
          <Alert onDismiss={() => dispatch(setSocketError(null))}>{socketError}</Alert>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* ---- left rail -------------------------------------------------- */}
        <aside className="hidden w-[228px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <FileTree
            files={files}
            activeFileId={activeFileId}
            dirty={dirty}
            canEdit={canEdit}
            onOpen={(fileId) => dispatch(setActiveFile(fileId))}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={handleDelete}
          />

          <div className="shrink-0 border-t border-line px-3 py-3">
            <h2 className="t-label mb-2">Session</h2>
            <dl className="space-y-1.5">
              {[
                { label: 'rev', value: String(metrics.rev), tone: 'text-ink' },
                {
                  label: 'latency',
                  value: metrics.latencyMs === null ? '—' : `${metrics.latencyMs}ms`,
                  tone:
                    metrics.latencyMs !== null && metrics.latencyMs < 120
                      ? 'text-lime'
                      : 'text-amber',
                },
                {
                  label: 'uptime',
                  value: metrics.connectedSince ? formatDuration(uptime) : '—',
                  tone: 'text-ink',
                },
                {
                  label: 'peers',
                  value: String(members.filter((m) => m.online).length),
                  tone: 'text-ink',
                },
              ].map((metric) => (
                <div key={metric.label} className="flex items-baseline justify-between">
                  <dt className="t-meta">{metric.label}</dt>
                  <dd className={`font-mono text-[11px] font-medium ${metric.tone}`}>
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        {/* ---- editor column ---------------------------------------------- */}
        <section className="flex min-w-0 flex-1 flex-col border-r border-line">
          <div className="flex h-9 shrink-0 items-center border-b border-line bg-surface">
            <span className="flex h-full items-center gap-2 border-b-2 border-cyan px-3 font-mono text-[12px] text-ink">
              <Dot tone="cyan" />
              {activeFile?.path ?? fileName}
              {dirty ? <span className="text-cyan">•</span> : null}
            </span>
            <div className="flex-1" />
            <span className="t-meta px-3">
              Ln {cursor.line}, Col {cursor.column}
            </span>
          </div>

          <div className="relative min-h-0 flex-1">
            {!synced && activeFileId ? (
              <div className="absolute inset-x-0 top-0 z-10 border-b border-amber-line bg-amber-tint py-1 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-amber">
                syncing {fileName}
              </div>
            ) : null}

            {!activeFileId ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-[13px] text-ink-secondary">This workspace has no files.</p>
                {canEdit ? (
                  <p className="t-caption">Use the + buttons in the workspace panel to add one.</p>
                ) : null}
              </div>
            ) : ydoc && awareness ? (
              <CodeEditor
                key={activeFileId}
                ydoc={ydoc}
                awareness={awareness}
                language={language}
                theme={theme}
                ready={synced}
                readOnly={!canEdit}
                onCursorChange={setCursor}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-ink-muted">
                <Spinner label="starting session" />
              </div>
            )}
          </div>

          <OutputPanel
            run={run}
            stdin={stdin}
            onStdinChange={setStdin}
            onClear={() => dispatch(clearRun())}
            open={outputOpen}
            onToggle={() => setOutputOpen((value) => !value)}
          />

          {/* ---- status bar ---------------------------------------------- */}
          <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-surface px-3">
            <ConnectionBadge status={connection} compact />
            <span aria-hidden className="text-ink-disabled">
              |
            </span>
            <span className="t-meta">{languageLabel(language)}</span>
            <span aria-hidden className="text-ink-disabled">
              |
            </span>
            <span className="t-meta hidden sm:inline">
              {files.filter((file) => file.type === 'file').length} files
            </span>
            <div className="flex-1" />
            <span className={`t-meta ${dirty ? 'text-amber' : ''}`}>
              {myRole === 'viewer'
                ? 'read only'
                : dirty
                  ? 'unsaved changes'
                  : 'all changes saved'}
            </span>
            <span aria-hidden className="text-ink-disabled">
              |
            </span>
            <span className="t-meta">{members.filter((member) => member.online).length} peers</span>
          </footer>
        </section>

        {/* ---- right rail -------------------------------------------------- */}
        <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto bg-surface max-lg:hidden">
          <CollaboratorsPanel
            members={members}
            currentUserId={user?.id}
            activity={activityByUser}
            canManageRoles={isOwner}
            onRoleChange={handleRoleChange}
          />
          <ActivityPanel
            entries={activity}
            group={activityGroup}
            onGroupChange={(group: ActivityGroup) => dispatch(setActivityGroup(group))}
          />
          <ChatPanel
            messages={chat.messages}
            loading={chat.status === 'loading'}
            error={chat.error}
            currentUserId={user?.id}
            disabled={!connected}
            onSend={handleSend}
          />
        </aside>
      </div>

      {/* Narrow screens: files, peers, activity and chat stack under the editor. */}
      <div className="flex max-h-[45vh] shrink-0 flex-col overflow-y-auto border-t border-line bg-surface lg:hidden">
        <div className="flex max-h-52 shrink-0 flex-col border-b border-line">
          <FileTree
            files={files}
            activeFileId={activeFileId}
            dirty={dirty}
            canEdit={canEdit}
            onOpen={(fileId) => dispatch(setActiveFile(fileId))}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        </div>
        <CollaboratorsPanel
          members={members}
          currentUserId={user?.id}
          activity={activityByUser}
          canManageRoles={isOwner}
          onRoleChange={handleRoleChange}
        />
        <ActivityPanel
          entries={activity}
          group={activityGroup}
          onGroupChange={(group: ActivityGroup) => dispatch(setActivityGroup(group))}
        />
        <ChatPanel
          messages={chat.messages}
          loading={chat.status === 'loading'}
          error={chat.error}
          currentUserId={user?.id}
          disabled={!connected}
          onSend={handleSend}
        />
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomId={roomId}
        roomName={room?.name ?? ''}
        passwordEnabled={settings?.passwordEnabled ?? false}
      />

      {settings ? (
        <RoomSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          saving={savingSettings}
          error={settingsError}
          onSave={(patch) => {
            void dispatch(saveRoomSettings({ roomId, patch })).then((result) => {
              if (saveRoomSettings.fulfilled.match(result)) {
                setSettingsOpen(false);
                dispatch(showToast({ title: 'Settings saved' }));
              }
            });
          }}
        />
      ) : null}

      <p className="sr-only" aria-live="polite">
        {members.filter((member) => member.online).length} collaborators online
      </p>
    </div>
  );
}
