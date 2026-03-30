import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import { Input } from '../components/ui/input';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';

interface SetupResponse {
  token: string;
  user: { id: string; username: string };
}

export function SetupPage() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');

  const form = useForm({
    defaultValues: { username: '', password: '' },
    onSubmit: async ({ value }) => {
      setError('');
      if (value.password.length < 8) {
        setError(i18n._(msg`auth.setup.passwordTooShort`));
        return;
      }
      try {
        const { token, user } = await api.post<SetupResponse>('/api/v1/auth/setup', {
          username: value.username,
          password: value.password,
        });
        login(token, user);
        navigate({ to: '/' });
      } catch {
        setError(i18n._(msg`auth.setup.error`));
      }
    },
  });

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-800 rounded-xl border border-zinc-700 p-8">
        <h1 className="text-xl font-semibold text-zinc-100 mb-2">
          {i18n._(msg`auth.setup.title`)}
        </h1>
        <p className="text-sm text-zinc-400 mb-6">{i18n._(msg`auth.setup.subtitle`)}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="username">
            {(field) => (
              <FormField field={field} label={i18n._(msg`auth.setup.username`)}>
                <Input
                  id={field.name}
                  type="text"
                  autoComplete="username"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </FormField>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <FormField field={field} label={i18n._(msg`auth.setup.password`)}>
                <Input
                  id={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </FormField>
            )}
          </form.Field>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting
                  ? i18n._(msg`auth.setup.loading`)
                  : i18n._(msg`auth.setup.submit`)}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </div>
  );
}
