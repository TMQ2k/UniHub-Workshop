import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { API_BASE_URL } from '../constants';

// ─── Types ───────────────────────────────────────────────
export type StaffUser = {
  id: string;
  name: string;
  studentId: string;
  role: string;
};

type AuthContextValue = {
  user: StaffUser | null;
  accessToken: string | null;
  isLoggedIn: boolean;
  userName: string;
  login: (studentId: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

// ─── Provider ────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const login = useCallback(async (studentId: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, password }),
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      throw new Error(json.error?.message || 'Đăng nhập thất bại');
    }

    if (json.data.user.role !== 'CHECKIN_STAFF') {
      throw new Error('Tài khoản không có quyền Check-in Staff');
    }

    setUser(json.data.user);
    setAccessToken(json.data.accessToken);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoggedIn: !!user && !!accessToken,
        userName: user?.name || user?.studentId || '',
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
