import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export function useApiClient() {
  const { getAccessToken } = useAuth();

  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}${path}`, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `Request failed: ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    [getAccessToken],
  );

  const post = useCallback(
    async <T>(path: string, data: unknown): Promise<T> => {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `Request failed: ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    [getAccessToken],
  );

  const del = useCallback(
    async (path: string): Promise<void> => {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `Request failed: ${res.status}`);
      }
    },
    [getAccessToken],
  );

  return { get, post, del };
}
