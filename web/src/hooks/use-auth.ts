import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';

interface AuthResponse {
  token: string;
  user: { id: string; username: string };
}

interface LoginResponse {
  token?: string;
  user?: { id: string; username: string };
  requires_2fa?: boolean;
  user_id?: string;
}

function isTokenExpired(token: string): boolean {
  // API tokens (mlml_ prefix) never expire — they're revoked server-side
  if (token.startsWith('mlml_')) return false;
  // Legacy JWT check (for Jellyfin compat tokens)
  try {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
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
  const [pending2FA, setPending2FA] = useState<string | null>(null); // user_id awaiting 2FA

  const isAuthenticated = !!token && !isTokenExpired(token);

  async function login(username: string, password: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/api/v1/auth/login', { username, password });
      if (res.requires_2fa && res.user_id) {
        setPending2FA(res.user_id);
        return; // don't navigate — LoginPage will show 2FA input
      }
      if (res.token && res.user) {
        storeLogin(res.token, res.user);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n._(msg`auth.error.loginFailed`);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function verify2FA(code: string) {
    if (!pending2FA) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/api/v1/auth/login/2fa', {
        user_id: pending2FA,
        code,
      });
      storeLogin(res.token, res.user);
      setPending2FA(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n._(msg`auth.error.invalid2FA`);
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

  function cancel2FA() {
    setPending2FA(null);
    setError(null);
  }

  return {
    isAuthenticated,
    token,
    user,
    loading,
    error,
    pending2FA,
    login,
    verify2FA,
    cancel2FA,
    setup,
    logout,
    clearError,
  };
}
