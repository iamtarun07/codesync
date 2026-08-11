import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, apiErrorMessage } from '../../services/api';
import type { User } from '../../types';

interface AuthState {
  user: User | null;
  /** `idle` until the first /me call resolves — routes wait on this. */
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous';
  submitting: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  submitting: false,
  error: null,
};

export const fetchMe = createAsyncThunk('auth/me', async () => {
  const res = await api.get<{ data: { user: User } }>('/auth/me');
  return res.data.data.user;
});

export const login = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post<{ data: { user: User } }>('/auth/login', payload);
      return res.data.data.user;
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not sign in'));
    }
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async (payload: { username: string; email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post<{ data: { user: User } }>('/auth/register', payload);
      return res.data.data.user;
    } catch (err) {
      return rejectWithValue(apiErrorMessage(err, 'Could not create the account'));
    }
  },
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await api.post('/auth/logout');
});

function startSubmit(state: AuthState) {
  state.submitting = true;
  state.error = null;
}

function finishSubmit(state: AuthState, action: { payload: User }) {
  state.submitting = false;
  state.user = action.payload;
  state.status = 'authenticated';
}

function failSubmit(state: AuthState, action: { payload: unknown }) {
  state.submitting = false;
  state.error = typeof action.payload === 'string' ? action.payload : 'Request failed';
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
      })
      .addCase(fetchMe.rejected, (state) => {
        state.user = null;
        state.status = 'anonymous';
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.status = 'anonymous';
      })
      .addCase(login.pending, startSubmit)
      .addCase(login.fulfilled, finishSubmit)
      .addCase(login.rejected, failSubmit)
      .addCase(register.pending, startSubmit)
      .addCase(register.fulfilled, finishSubmit)
      .addCase(register.rejected, failSubmit);
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
