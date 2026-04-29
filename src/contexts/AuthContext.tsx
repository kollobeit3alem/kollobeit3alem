'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, AuthContextType, LoginResponse } from '@/types';

const WORKER_BASE_URL = 'https://kollobeit3alem.pages.dev';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // التحقق من الجلسة المحفوظة عند التحميل
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user_info');

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        setToken(storedToken);
        setUser(parsedUser);
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credential: string): Promise<void> => {
    try {
      const response = await fetch(`${WORKER_BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential }),
      });

      const data: LoginResponse = await response.json();

      if (data.success) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_info', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        throw new Error('فشل تسجيل الدخول');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    setToken(null);
    setUser(null);
  }, []);

  const checkAuth = useCallback((): boolean => {
    return !!token && !!user;
  }, [token, user]);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// دالة مساعدة لاستدعاء API مع توكن
export async function apiCall(
  endpoint: string,
  token: string | null,
  method: string = 'GET',
  body: unknown = null
): Promise<unknown> {
  if (!token) {
    throw new Error('No authentication token');
  }

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${WORKER_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    if (errorData.invalidSession) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      // في Next.js نستخدم window.location لأننا في Client Component
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new Error('تم تسجيل الدخول من جهاز آخر');
    }
    throw new Error(errorData.error || 'API Error');
  }

  return response.json();
}

// استدعاء API عام بدون توثيق
export async function publicApiCall(
  endpoint: string,
  method: string = 'GET',
  body: unknown = null
): Promise<unknown> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${WORKER_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || 'API Error');
  }

  return response.json();
}
