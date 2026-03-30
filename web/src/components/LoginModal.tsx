import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api-client';
import { Modal } from './Modal';
import { Button } from './ui/button';
import { Field, FieldError, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { PasswordInput } from './ui/password-input';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LoginModal({ open, onClose, onSuccess }: LoginModalProps) {
  const { i18n } = useLingui();
  const { login, setup, loading, error, clearError } = useAuth();

  // Check if admin user already exists
  const { data: status } = useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => api.get<{ initialized: boolean }>('/api/v1/auth/status'),
    enabled: open,
  });
  const isInitialized = status?.initialized ?? true; // default to true (hide setup)

  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [localError, setLocalError] = useState('');

  const form = useForm({
    defaultValues: { username: '', password: '' },
    onSubmit: async ({ value }) => {
      setLocalError('');

      if (mode === 'setup' && value.password.length < 8) {
        setLocalError(i18n._(msg`auth.setup.passwordTooShort`));
        return;
      }

      try {
        if (mode === 'login') {
          await login(value.username, value.password);
        } else {
          await setup(value.username, value.password);
        }
        form.reset();
        setLocalError('');
        clearError();
        onSuccess?.();
        onClose();
      } catch {
        // error is set by useAuth
      }
    },
  });

  // Auto-switch to setup if not initialized
  useEffect(() => {
    if (open && status && !status.initialized) {
      setMode('setup');
    }
  }, [open, status]);

  function switchMode(newMode: 'login' | 'setup') {
    form.reset();
    setLocalError('');
    clearError();
    setMode(newMode);
  }

  const displayError = localError || error;

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="pt-2">
        {/* Mode tabs — only show setup tab if no admin exists yet */}
        {!isInitialized ? (
          <div className="flex mb-6 border-b border-white/[0.06]">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'text-white border-b-2 border-mm-accent'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              {i18n._(msg`auth.login.title`)}
            </button>
            <button
              type="button"
              onClick={() => switchMode('setup')}
              className={`flex-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${
                mode === 'setup'
                  ? 'text-white border-b-2 border-mm-accent'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              {i18n._(msg`auth.setup.title`)}
            </button>
          </div>
        ) : (
          <h3 className="text-lg font-semibold text-white mb-6">{i18n._(msg`auth.login.title`)}</h3>
        )}

        {mode === 'setup' && (
          <p className="text-[13px] text-white/40 mb-4">{i18n._(msg`auth.setup.subtitle`)}</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="username">
            {(field) => (
              <Field
                data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
              >
                <FieldLabel htmlFor={field.name}>{i18n._(msg`auth.login.username`)}</FieldLabel>
                <Input
                  id={field.name}
                  type="text"
                  autoComplete="username"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
                <FieldError>
                  {field.state.meta.isTouched && field.state.meta.errors[0]
                    ? String(field.state.meta.errors[0])
                    : null}
                </FieldError>
              </Field>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <Field
                data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
              >
                <FieldLabel htmlFor={field.name}>{i18n._(msg`auth.login.password`)}</FieldLabel>
                <PasswordInput
                  id={field.name}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
                <FieldError>
                  {field.state.meta.isTouched && field.state.meta.errors[0]
                    ? String(field.state.meta.errors[0])
                    : null}
                </FieldError>
              </Field>
            )}
          </form.Field>

          {displayError && <p className="text-red-400 text-[13px]">{displayError}</p>}

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={loading || isSubmitting} className="w-full">
                {loading || isSubmitting
                  ? i18n._(msg`common.loading`)
                  : mode === 'login'
                    ? i18n._(msg`auth.login.submit`)
                    : i18n._(msg`auth.setup.submit`)}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </Modal>
  );
}
