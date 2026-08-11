import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

export type Theme = 'dark' | 'light';
export type ToastTone = 'neutral' | 'success' | 'error';

export interface Toast {
  id: string;
  title: string;
  /** Mono detail line, e.g. "rev 1842" or the room ID. */
  detail?: string;
  tone: ToastTone;
}

const STORAGE_KEY = 'codesync-theme';

function readStoredTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(STORAGE_KEY, theme);
}

interface UiState {
  theme: Theme;
  /** One at a time, per the spec. */
  toast: Toast | null;
}

const initialState: UiState = { theme: readStoredTheme(), toast: null };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      applyTheme(action.payload);
    },
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.theme);
    },
    showToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toast = action.payload;
      },
      prepare(input: { title: string; detail?: string; tone?: ToastTone }) {
        return {
          payload: {
            id: nanoid(),
            title: input.title,
            detail: input.detail,
            tone: input.tone ?? 'neutral',
          },
        };
      },
    },
    dismissToast(state) {
      state.toast = null;
    },
  },
});

export const { setTheme, toggleTheme, showToast, dismissToast } = uiSlice.actions;
export default uiSlice.reducer;
