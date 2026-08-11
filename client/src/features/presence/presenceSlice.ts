import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomMemberView } from '../../types';

interface PresenceState {
  members: RoomMemberView[];
}

const initialState: PresenceState = { members: [] };

const presenceSlice = createSlice({
  name: 'presence',
  initialState,
  reducers: {
    setMembers(state, action: PayloadAction<RoomMemberView[]>) {
      state.members = action.payload;
    },
    clearMembers(state) {
      state.members = [];
    },
  },
});

export const { setMembers, clearMembers } = presenceSlice.actions;
export default presenceSlice.reducer;
