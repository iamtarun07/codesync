import axios, { AxiosError } from 'axios';
import type { ApiFailure } from '../types';
import { getAuthToken } from './authToken';
import { API_URL } from './config';

export const api = axios.create({
  baseURL: API_URL,
  // Required: the JWT lives in an httpOnly cookie.
  withCredentials: true,
  timeout: 15_000,
});

// Cookie first, Bearer second. Browsers that block the cross-site cookie send
// nothing at all otherwise, which reads as "not logged in" on every request
// after the login call itself. See services/authToken.ts.
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** The server's machine-readable error code, when there is one. */
export function apiErrorCode(error: unknown): string | null {
  const axiosError = error as AxiosError<ApiFailure>;
  return axiosError?.response?.data?.code ?? null;
}

/** Turns any axios failure into a message safe to render. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const axiosError = error as AxiosError<ApiFailure>;
  if (axiosError?.response?.data?.message) return axiosError.response.data.message;
  if (axiosError?.code === 'ECONNABORTED') return 'The server took too long to respond';
  if (axiosError?.message === 'Network Error') return 'Cannot reach the server';
  return fallback;
}
