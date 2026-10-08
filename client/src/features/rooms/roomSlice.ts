import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api, apiErrorCode, apiErrorMessage } from '../../services/api';
import type {
  ActivityEntry,
  ActivityGroup,
  ConnectionStatus,
  Room,
  RoomFile,
  RoomRole,
  RoomSettings,
  RunOutput,
  RunState,
} from '../../types';

interface RoomState {
  room: Room | null;
  /** Language of the active file. */
  language: string;
  files: RoomFile[];
  activeFileId: string | null;
  myRole: RoomRole | null;
  settings: RoomSettings | null;
  activity: ActivityEntry[];
  activityGroup: ActivityGroup;
  /** `locked` means the room needs its password before anything is fetched. */
  status: 'idle' | 'loading' | 'ready' | 'failed' | 'locked';
  error: string | null;
  unlockError: string | null;
  unlocking: boolean;
  savingSettings: boolean;
  settingsError: string | null;
  connection: ConnectionStatus;
  /** Set when the server confirms a manual or automatic save. */
  lastSavedAt: string | null;
  socketError: string | null;
  run: RunState;
}

const initialState: RoomState = {
  room: null,
  language: 'javascript',
  files: [],
  activeFileId: null,
  myRole: null,
  settings: null,
  activity: [],
  activityGroup: 'all',
  status: 'idle',
  error: null,
  unlockError: null,
  unlocking: false,
  savingSettings: false,
  settingsError: null,
  connection: 'idle',
  lastSavedAt: null,
  socketError: null,
  run: { status: 'idle', by: null, output: null, error: null },
};

export const openRoom = createAsyncThunk(
  'room/open',
  async (roomId: string, { rejectWithValue }) => {
    try {
      // Join is idempotent server-side and guarantees membership before the
      // socket handshake asks for the document.
      await api.post(`/rooms/${roomId}/join`);
      const res = await api.get<{ data: { room: Room } }>(`/rooms/${roomId}`);
      return res.data.data.room;
    } catch (err) {
      return rejectWithValue({
        message: apiErrorMessage(err, 'Could not open that room'),
        code: apiErrorCode(err),
      });
    }
  },
);

export const unlockRoom = createAsyncThunk(
  'room/unlock',
  async ({ roomId, password }: { roomId: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post<{ data: { room: Room } }>(`/rooms/${roomId}/unlock`, { password });
      return res.data.data.room;
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Incorrect password'));
    }
  },
);

interface SettingsPatch {
  name?: string;
  isPublic?: boolean;
  password?: { enabled: boolean; value?: string };
}

export const saveRoomSettings = createAsyncThunk(
  'room/saveSettings',
  async ({ roomId, patch }: { roomId: string; patch: SettingsPatch }, { rejectWithValue }) => {
    try {
      const res = await api.patch<{ data: { room: Room } }>(`/rooms/${roomId}/settings`, patch);
      return res.data.data.room;
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not save settings'));
    }
  },
);

export const changeMemberRole = createAsyncThunk(
  'room/changeRole',
  async (
    { roomId, userId, role }: { roomId: string; userId: string; role: Exclude<RoomRole, 'owner'> },
    { rejectWithValue },
  ) => {
    try {
      await api.patch(`/rooms/${roomId}/members/${userId}/role`, { role });
      return { userId, role };
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not change that role'));
    }
  },
);

export const fetchActivity = createAsyncThunk(
  'room/activity',
  async ({ roomId, group }: { roomId: string; group: ActivityGroup }) => {
    const res = await api.get<{ data: { activity: ActivityEntry[] } }>(
      `/rooms/${roomId}/activity`,
      { params: group === 'all' ? undefined : { group } },
    );
    return res.data.data.activity;
  },
);

const roomSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    setLanguage(state, action: PayloadAction<string>) {
      state.language = action.payload;
    },
    setConnection(state, action: PayloadAction<ConnectionStatus>) {
      state.connection = action.payload;
    },
    setSaved(state, action: PayloadAction<string>) {
      state.lastSavedAt = action.payload;
    },
    setSocketError(state, action: PayloadAction<string | null>) {
      state.socketError = action.payload;
    },
    /** Authoritative room snapshot from the socket handshake. */
    roomStateReceived(
      state,
      action: PayloadAction<{
        role: RoomRole;
        files: RoomFile[];
        settings: RoomSettings;
        name: string;
      }>,
    ) {
      state.myRole = action.payload.role;
      state.files = action.payload.files;
      state.settings = action.payload.settings;
      if (state.room) state.room.name = action.payload.name;
      const active = action.payload.files.find((f) => f.fileId === state.activeFileId);
      const next = active ?? action.payload.files.find((f) => f.type === 'file');
      state.activeFileId = next?.fileId ?? null;
      if (next) state.language = next.language;
    },
    setFiles(state, action: PayloadAction<RoomFile[]>) {
      state.files = action.payload;
      const active =
        action.payload.find((file) => file.fileId === state.activeFileId) ??
        action.payload.find((file) => file.type === 'file');
      state.activeFileId = active?.fileId ?? null;
      if (active) state.language = active.language;
    },
    setActiveFile(state, action: PayloadAction<string>) {
      const file = state.files.find((f) => f.fileId === action.payload && f.type === 'file');
      if (!file) return;
      state.activeFileId = file.fileId;
      state.language = file.language;
    },
    setMyRole(state, action: PayloadAction<RoomRole>) {
      state.myRole = action.payload;
    },
    setSettings(state, action: PayloadAction<RoomSettings>) {
      state.settings = action.payload;
      if (state.room) state.room.name = action.payload.name;
    },
    setActivityGroup(state, action: PayloadAction<ActivityGroup>) {
      state.activityGroup = action.payload;
    },
    activityAdded(state, action: PayloadAction<ActivityEntry>) {
      state.activity = [action.payload, ...state.activity].slice(0, 100);
    },
    clearSettingsError(state) {
      state.settingsError = null;
    },
    runStarted(state, action: PayloadAction<string>) {
      state.run = { status: 'running', by: action.payload, output: null, error: null };
    },
    runFinished(state, action: PayloadAction<RunOutput>) {
      state.run = {
        status: 'done',
        by: action.payload.by,
        output: action.payload,
        error: null,
      };
    },
    runFailed(state, action: PayloadAction<string>) {
      state.run = { status: 'failed', by: state.run.by, output: null, error: action.payload };
    },
    clearRun(state) {
      state.run = { status: 'idle', by: null, output: null, error: null };
    },
    leaveRoom() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    const applyRoom = (state: RoomState, room: Room) => {
      state.status = 'ready';
      state.room = room;
      state.files = room.files;
      state.settings = room.settings;
      state.myRole = room.myRole;
      const active = room.files.find((f) => f.fileId === state.activeFileId && f.type === 'file');
      const next = active ?? room.files.find((f) => f.type === 'file');
      state.activeFileId = next?.fileId ?? null;
      state.language = next?.language ?? room.language;
    };

    builder
      .addCase(openRoom.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(openRoom.fulfilled, (state, action) => {
        applyRoom(state, action.payload);
      })
      .addCase(openRoom.rejected, (state, action) => {
        const payload = action.payload as { message: string; code: string | null } | undefined;
        // A protected room is not an error — it is a gate the user can pass.
        state.status = payload?.code === 'PASSWORD_REQUIRED' ? 'locked' : 'failed';
        state.error = payload?.message ?? 'Request failed';
      })
      .addCase(unlockRoom.pending, (state) => {
        state.unlocking = true;
        state.unlockError = null;
      })
      .addCase(unlockRoom.fulfilled, (state, action) => {
        state.unlocking = false;
        state.unlockError = null;
        applyRoom(state, action.payload);
      })
      .addCase(unlockRoom.rejected, (state, action) => {
        state.unlocking = false;
        state.unlockError = typeof action.payload === 'string' ? action.payload : 'Incorrect password';
      })
      .addCase(saveRoomSettings.pending, (state) => {
        state.savingSettings = true;
        state.settingsError = null;
      })
      .addCase(saveRoomSettings.fulfilled, (state, action) => {
        state.savingSettings = false;
        state.room = action.payload;
        state.settings = action.payload.settings;
      })
      .addCase(saveRoomSettings.rejected, (state, action) => {
        state.savingSettings = false;
        state.settingsError =
          typeof action.payload === 'string' ? action.payload : 'Could not save settings';
      })
      .addCase(changeMemberRole.rejected, (state, action) => {
        state.socketError =
          typeof action.payload === 'string' ? action.payload : 'Could not change that role';
      })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.activity = action.payload;
      });
  },
});

export const {
  setLanguage,
  setConnection,
  setSaved,
  setSocketError,
  roomStateReceived,
  setFiles,
  setActiveFile,
  setMyRole,
  setSettings,
  setActivityGroup,
  activityAdded,
  clearSettingsError,
  leaveRoom,
  runStarted,
  runFinished,
  runFailed,
  clearRun,
} = roomSlice.actions;
export default roomSlice.reducer;
