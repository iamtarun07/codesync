import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { Alert } from '../components/common/Alert';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';
import { LanguageSelect } from '../components/editor/LanguageSelect';
import { RoomTable } from '../components/room/RoomTable';
import {
  clearRoomsError,
  createRoom,
  deleteRoom,
  fetchRooms,
  joinRoom,
} from '../features/rooms/roomsSlice';
import { showToast } from '../features/ui/uiSlice';
import { AppShell } from '../layouts/AppShell';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const { items, status, error, mutating, mutationError } = useAppSelector((state) => state.rooms);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [joinId, setJoinId] = useState('');

  useEffect(() => {
    void dispatch(fetchRooms());
  }, [dispatch]);

  const stats = useMemo(() => {
    const peers = new Set<string>();
    items.forEach((room) => room.members.forEach((member) => peers.add(member.user.id)));
    const shared = items.filter((room) => room.memberCount > 1).length;
    return { rooms: items.length, shared, peers: peers.size };
  }, [items]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const result = await dispatch(createRoom({ name: name.trim(), language }));
    if (createRoom.fulfilled.match(result)) {
      setName('');
      setShowCreate(false);
      navigate(`/room/${result.payload.roomId}`);
    }
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    const roomId = joinId.trim().toUpperCase();
    if (!roomId) return;
    const result = await dispatch(joinRoom(roomId));
    if (joinRoom.fulfilled.match(result)) {
      setJoinId('');
      setShowJoin(false);
      navigate(`/room/${roomId}`);
    }
  };

  const handleDelete = (roomId: string) => {
    if (!window.confirm('Delete this room and its chat history? This cannot be undone.')) return;
    void dispatch(deleteRoom(roomId));
    dispatch(showToast({ title: 'Room deleted', detail: roomId }));
  };

  return (
    <AppShell
      breadcrumb={['workspace', 'rooms']}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => setShowJoin((value) => !value)}>
            Join room
          </Button>
          <Button size="sm" onClick={() => setShowCreate((value) => !value)}>
            + Create room
          </Button>
        </>
      }
    >
      <div className="mx-auto w-full max-w-[1180px] px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="t-page-title">
              {greeting()}, {user?.username}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-secondary">
              {stats.rooms === 0
                ? 'No rooms yet — create one to start a session.'
                : `${stats.rooms} room${stats.rooms === 1 ? '' : 's'} · ${stats.shared} shared · ${stats.peers} peer${stats.peers === 1 ? '' : 's'} across your workspaces.`}
            </p>
          </div>

          <dl className="flex divide-x divide-[var(--cs-border)] rounded-[8px] border border-line bg-surface">
            {[
              { label: 'Rooms', value: stats.rooms, tone: 'text-ink' },
              { label: 'Shared', value: stats.shared, tone: 'text-lime' },
              { label: 'Peers', value: stats.peers, tone: 'text-ink' },
            ].map((stat) => (
              <div key={stat.label} className="px-5 py-3">
                <dt className="t-label">{stat.label}</dt>
                <dd className={`mt-1 font-mono text-[22px] font-semibold ${stat.tone}`}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {(showCreate || showJoin) && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {showCreate ? (
              <form
                onSubmit={handleCreate}
                className="space-y-4 rounded-[8px] border border-line bg-surface p-4"
              >
                <h2 className="t-label">Create a room</h2>
                <Input
                  label="Room name"
                  value={name}
                  maxLength={60}
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  placeholder="auth-service refactor"
                />
                <div className="flex items-center justify-between gap-3">
                  <LanguageSelect value={language} onChange={setLanguage} />
                  <Button type="submit" size="sm" loading={mutating} disabled={!name.trim()}>
                    Create room
                  </Button>
                </div>
              </form>
            ) : null}

            {showJoin ? (
              <form
                onSubmit={handleJoin}
                className="space-y-4 rounded-[8px] border border-line bg-surface p-4"
              >
                <h2 className="t-label">Join with a room ID</h2>
                <Input
                  label="Room ID"
                  mono
                  value={joinId}
                  maxLength={16}
                  autoFocus
                  onChange={(event) => setJoinId(event.target.value.toUpperCase())}
                  placeholder="AB7K92QX"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  loading={mutating}
                  disabled={!joinId.trim()}
                >
                  Join room
                </Button>
              </form>
            ) : null}
          </div>
        )}

        {mutationError ? (
          <div className="mt-6">
            <Alert onDismiss={() => dispatch(clearRoomsError())}>{mutationError}</Alert>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="t-label">Recent rooms</h2>
          <button
            type="button"
            onClick={() => void dispatch(fetchRooms())}
            className="t-meta transition hover:text-ink"
          >
            refresh
          </button>
        </div>

        <div className="mt-2.5">
          {status === 'loading' ? (
            <div className="flex justify-center rounded-[8px] border border-line bg-surface py-14 text-ink-muted">
              <Spinner label="loading rooms" />
            </div>
          ) : null}

          {status === 'failed' && error ? (
            <Alert onDismiss={() => dispatch(clearRoomsError())}>{error}</Alert>
          ) : null}

          {status === 'ready' && items.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-line bg-surface py-14 text-center">
              <p className="text-[13.5px] font-medium text-ink">No rooms yet</p>
              <p className="mt-1 text-[12px] text-ink-secondary">
                Create your first room, or join one with an ID a teammate shared.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  + Create room
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setShowJoin(true)}>
                  Join room
                </Button>
              </div>
            </div>
          ) : null}

          {status === 'ready' && items.length > 0 ? (
            <RoomTable rooms={items} currentUserId={user?.id} onDelete={handleDelete} />
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
