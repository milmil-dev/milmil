import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';

interface AuthResponse {
  token: string;
  user: { id: string; username: string };
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    // Add 30s buffer
    return payload.exp * 1000 < Date.now() - 30_000;
  } catch {
    return true;
  }
}

export function useAuth() {
  const { i18n } = useLingui();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const storeLogin = useAuthStore((s) => s.login);
  const storeLogout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!token && !isTokenExpired(token);

  async function login(username: string, password: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/api/v1/auth/login', { username, password });
      storeLogin(res.token, res.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n._(msg`auth.error.loginFailed`);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function setup(username: string, password: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/api/v1/auth/setup', { username, password });
      storeLogin(res.token, res.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n._(msg`auth.error.setupFailed`);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    storeLogout();
  }

  function clearError() {
    setError(null);
  }

  return {
    isAuthenticated,
    token,
    user,
    loading,
    error,
    login,
    setup,
    logout,
    clearError,
  };
}
