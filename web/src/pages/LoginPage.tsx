import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';

interface LoginResponse {
  token: string;
  user: { id: string; username: string };
}

export function LoginPage() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.post<LoginResponse>('/api/v1/auth/login', {
        username,
        password,
      });
      login(token, user);
      navigate({ to: '/' });
    } catch {
      setError(i18n._(msg`auth.error.invalidCredentials`));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-800 rounded-xl border border-zinc-700 p-8">
        <h1 className="text-xl font-semibold text-zinc-100 mb-6">
          {i18n._(msg`auth.login.title`)}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              {i18n._(msg`auth.login.username`)}
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              {i18n._(msg`auth.login.password`)}
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? i18n._(msg`auth.login.loading`) : i18n._(msg`auth.login.submit`)}
          </button>
        </form>
      </div>
    </div>
  );
}
