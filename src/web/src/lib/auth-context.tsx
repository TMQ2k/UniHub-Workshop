'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import type { User, AuthTokens } from '@/lib/types';

// ============================================================
// Auth Context — client-side auth state management
// ============================================================

interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (studentId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isOrganizer: () => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const STORAGE_KEY_TOKEN = 'unihub_access_token';
const STORAGE_KEY_REFRESH = 'unihub_refresh_token';
const STORAGE_KEY_USER = 'unihub_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage on mount — reject staff sessions
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      const storedUser = localStorage.getItem(STORAGE_KEY_USER);
      if (storedToken && storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed.role === 'CHECKIN_STAFF') {
          // Staff accounts are not allowed on web — clear stale session
          localStorage.removeItem(STORAGE_KEY_TOKEN);
          localStorage.removeItem(STORAGE_KEY_REFRESH);
          localStorage.removeItem(STORAGE_KEY_USER);
        } else {
          setAccessToken(storedToken);
          setUser(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (studentId: string, password: string) => {
    const data = await apiFetch<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ studentId, password }),
    });

    // Block CHECKIN_STAFF from web — they must use the mobile app
    if (data.user.role === 'CHECKIN_STAFF') {
      // Revoke the token server-side (best-effort)
      try {
        await apiFetch('/auth/logout', { method: 'POST', token: data.accessToken });
      } catch { /* ignore */ }
      throw new Error('Tài khoản Staff chỉ được sử dụng trên ứng dụng mobile để quét QR. Vui lòng sử dụng Expo Go trên điện thoại.');
    }

    setAccessToken(data.accessToken);
    setUser(data.user);

    localStorage.setItem(STORAGE_KEY_TOKEN, data.accessToken);
    localStorage.setItem(STORAGE_KEY_REFRESH, data.refreshToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
  }, []);

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        await apiFetch('/auth/logout', {
          method: 'POST',
          token: accessToken,
        });
      }
    } catch {
      // Best-effort logout
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_REFRESH);
    localStorage.removeItem(STORAGE_KEY_USER);
  }, [accessToken]);

  const isOrganizer = useCallback(() => {
    return user?.role === 'ORGANIZER';
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, isOrganizer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
