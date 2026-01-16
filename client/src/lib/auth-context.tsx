import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, getAuthToken, clearAuthToken } from './api';
import { useLocation } from 'wouter';

interface User {
  id: number;
  email: string;
  fullName: string;
  username: string;
  balance: string;
  phptBalance: string;
  kycStatus: string;
  isActive: boolean;
  isAdmin: boolean;
  role: "super_admin" | "admin" | "support" | "user";
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; fullName: string; username: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [_, setLocation] = useLocation();

  const refreshUser = async () => {
    try {
      const userData = await api.auth.getMe();
      setUser(userData);
    } catch (error: any) {
      setUser(null);
      // Clear invalid token on auth failure
      if (error.message === 'Unauthorized') {
        clearAuthToken();
      }
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      if (token) {
        await refreshUser();
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const { user } = await api.auth.login({ email, password });
    setUser(user);
    setLocation('/dashboard');
  };

  const register = async (data: { email: string; password: string; fullName: string; username: string }) => {
    const { user } = await api.auth.register(data);
    setUser(user);
    setLocation('/dashboard');
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    // Force full page reload to show preloader and landing page
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
