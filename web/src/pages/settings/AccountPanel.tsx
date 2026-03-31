import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';

import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

const inputClass = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

export function AccountPanel() {
  const user = useAuthStore((s) => s.user);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const changePassword = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      api.put('/api/v1/auth/password', data),
    onSuccess: () => {
      toast.success('Password updated successfully');
      form.reset();
    },
    onError: () => toast.error('Failed to update password'),
  });

  const form = useForm({
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
    onSubmit: async ({ value }) => {
      await changePassword.mutateAsync({
        current_password: value.current_password,
        new_password: value.new_password,
      });
    },
  });

  return (
    <div>
      <h2 className="text-[18px] font-bold text-white">Account</h2>
      <p className="mt-1 mb-6 text-[11px] text-white/35">
        Manage your profile and security settings
      </p>

      <div className="max-w-3xl space-y-3">
        {/* Profile card */}
        <SettingsCard label="Profile">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mm-accent/15 text-sm font-semibold text-mm-accent ring-1 ring-mm-accent/25">
              {user?.username?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-[13px] font-medium text-white">{user?.username ?? 'Unknown'}</p>
              <p className="text-[10px] text-white/30">ID: {user?.id ?? '-'}</p>
            </div>
          </div>
        </SettingsCard>

        {/* Change Password card */}
        <SettingsCard label="Change Password">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="space-y-4"
          >
            <form.Field
              name="current_password"
              validators={{
                onSubmit: ({ value }) => {
                  if (!value) return 'Current password is required';
                  return undefined;
                },
              }}
            >
              {(field) => (
                <Field
                  data-invalid={
                    field.state.meta.isTouched && field.state.meta.errors.length > 0
                  }
                >
                  <FieldLabel htmlFor={field.name}>Current Password</FieldLabel>
                  <PasswordInput
                    id={field.name}
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className={inputClass}
                  />
                  <FieldError>
                    {field.state.meta.isTouched && field.state.meta.errors[0]
                      ? String(field.state.meta.errors[0])
                      : null}
                  </FieldError>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="new_password"
              validators={{
                onSubmit: ({ value }) => {
                  if (!value) return 'New password is required';
                  if (value.length < 8) return 'Password must be at least 8 characters';
                  return undefined;
                },
              }}
            >
              {(field) => (
                <Field
                  data-invalid={
                    field.state.meta.isTouched && field.state.meta.errors.length > 0
                  }
                >
                  <FieldLabel htmlFor={field.name}>New Password</FieldLabel>
                  <PasswordInput
                    id={field.name}
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className={inputClass}
                  />
                  <FieldError>
                    {field.state.meta.isTouched && field.state.meta.errors[0]
                      ? String(field.state.meta.errors[0])
                      : null}
                  </FieldError>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="confirm_password"
              validators={{
                onSubmit: ({ value, fieldApi }) => {
                  if (!value) return 'Please confirm your new password';
                  if (value !== fieldApi.form.getFieldValue('new_password')) {
                    return 'Passwords do not match';
                  }
                  return undefined;
                },
              }}
            >
              {(field) => (
                <Field
                  data-invalid={
                    field.state.meta.isTouched && field.state.meta.errors.length > 0
                  }
                >
                  <FieldLabel htmlFor={field.name}>Confirm New Password</FieldLabel>
                  <PasswordInput
                    id={field.name}
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className={inputClass}
                  />
                  <FieldError>
                    {field.state.meta.isTouched && field.state.meta.errors[0]
                      ? String(field.state.meta.errors[0])
                      : null}
                  </FieldError>
                </Field>
              )}
            </form.Field>

            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting || changePassword.isPending}>
                  {isSubmitting || changePassword.isPending ? 'Updating...' : 'Update Password'}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </SettingsCard>

        {/* Two-Factor Authentication card */}
        <SettingsCard label="Two-Factor Authentication">
          <p className="mb-4 text-[11px] text-white/40">
            Add an extra layer of security to your account by requiring a time-based one-time
            password (TOTP) in addition to your password when signing in.
          </p>

          <div className="flex items-center gap-3">
            <Switch
              id="2fa-toggle"
              checked={twoFactorEnabled}
              onCheckedChange={(checked) => {
                setTwoFactorEnabled(checked);
                if (checked) {
                  toast.info('2FA is not yet available');
                }
              }}
            />
            <label htmlFor="2fa-toggle" className="text-[12px] text-white/60">
              {twoFactorEnabled ? 'Enabled' : 'Disabled'}
            </label>
          </div>

          {twoFactorEnabled && (
            <div className="mt-5 space-y-4">
              <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-[11px] text-white/20">
                QR Code
              </div>

              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="totp-code" className="text-[11px] font-medium text-white/50">
                    Verification Code
                  </label>
                  <Input
                    id="totp-code"
                    placeholder="Enter 6-digit code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className={`${inputClass} w-48`}
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    toast.info('2FA is not yet available');
                  }}
                >
                  Verify
                </Button>
              </div>
            </div>
          )}
        </SettingsCard>
      </div>
    </div>
  );
}
