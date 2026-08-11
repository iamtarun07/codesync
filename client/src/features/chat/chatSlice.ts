import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api, apiErrorMessage } from '../../services/api';
import type { ChatMessage } from '../../types';

interface ChatState {
  messages: ChatMessage[];
  status: 'idle' | 'loading' | 'ready' | 'failed';
  error: string | null;
}

const initialState: ChatState = { messages: [], status: 'idle', error: null };

export const fetchMessages = createAsyncThunk(
  'chat/fetch',
  async (roomId: string, { rejectWithValue }) => {
    try {
      const res = await api.get<{ data: { messages: ChatMessage[] } }>(
        `/rooms/${roomId}/messages`,
        { params: { limit: 50 } },
      );
      // API returns newest-first; the transcript renders oldest-first.
      return [...res.data.data.messages].reverse();
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not load the chat history'));
    }
  },
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    messageReceived(state, action: PayloadAction<ChatMessage>) {
      if (state.messages.some((m) => m.id === action.payload.id)) return;
      state.messages.push(action.payload);
    },
    clearChat() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.status = 'ready';
        state.messages = action.payload;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.status = 'failed';
        state.error = typeof action.payload === 'string' ? action.payload : 'Request failed';
      });
  },
});

export const { messageReceived, clearChat } = chatSlice.actions;
export default chatSlice.reducer;
