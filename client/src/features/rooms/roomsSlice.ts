import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, apiErrorMessage } from '../../services/api';
import type { Room } from '../../types';

interface RoomsState {
  items: Room[];
  status: 'idle' | 'loading' | 'ready' | 'failed';
  error: string | null;
  mutating: boolean;
  mutationError: string | null;
}

const initialState: RoomsState = {
  items: [],
  status: 'idle',
  error: null,
  mutating: false,
  mutationError: null,
};

export const fetchRooms = createAsyncThunk('rooms/fetch', async (_arg, { rejectWithValue }) => {
  try {
    const res = await api.get<{ data: { rooms: Room[] } }>('/rooms');
    return res.data.data.rooms;
  } catch (err) {
    return rejectWithValue(apiErrorMessage(err, 'Could not load your rooms'));
  }
});

export const createRoom = createAsyncThunk(
  'rooms/create',
  async (payload: { name: string; language: string }, { rejectWithValue }) => {
    try {
      const res = await api.post<{ data: { room: Room } }>('/rooms', payload);
      return res.data.data.room;
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not create the room'));
    }
  },
);

export const joinRoom = createAsyncThunk(
  'rooms/join',
  async (roomId: string, { rejectWithValue }) => {
    try {
      const res = await api.post<{ data: { room: Room } }>(`/rooms/${roomId}/join`);
      return res.data.data.room;
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not join that room'));
    }
  },
);

export const deleteRoom = createAsyncThunk(
  'rooms/delete',
  async (roomId: string, { rejectWithValue }) => {
    try {
      await api.delete(`/rooms/${roomId}`);
      return roomId;
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not delete the room'));
    }
  },
);

const roomsSlice = createSlice({
  name: 'rooms',
  initialState,
  reducers: {
    clearRoomsError(state) {
      state.error = null;
      state.mutationError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRooms.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRooms.fulfilled, (state, action) => {
        state.status = 'ready';
        state.items = action.payload;
      })
      .addCase(fetchRooms.rejected, (state, action) => {
        state.status = 'failed';
        state.error = typeof action.payload === 'string' ? action.payload : 'Request failed';
      })
      .addCase(createRoom.pending, (state) => {
        state.mutating = true;
        state.mutationError = null;
      })
      .addCase(createRoom.fulfilled, (state, action) => {
        state.mutating = false;
        state.items.unshift(action.payload);
      })
      .addCase(createRoom.rejected, (state, action) => {
        state.mutating = false;
        state.mutationError =
          typeof action.payload === 'string' ? action.payload : 'Request failed';
      })
      .addCase(joinRoom.pending, (state) => {
        state.mutating = true;
        state.mutationError = null;
      })
      .addCase(joinRoom.fulfilled, (state, action) => {
        state.mutating = false;
        if (!state.items.some((r) => r.roomId === action.payload.roomId)) {
          state.items.unshift(action.payload);
        }
      })
      .addCase(joinRoom.rejected, (state, action) => {
        state.mutating = false;
        state.mutationError =
          typeof action.payload === 'string' ? action.payload : 'Request failed';
      })
      .addCase(deleteRoom.fulfilled, (state, action) => {
        state.items = state.items.filter((room) => room.roomId !== action.payload);
      })
      .addCase(deleteRoom.rejected, (state, action) => {
        state.mutationError =
          typeof action.payload === 'string' ? action.payload : 'Request failed';
      });
  },
});

export const { clearRoomsError } = roomsSlice.actions;
export default roomsSlice.reducer;
