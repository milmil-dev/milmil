import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

interface TwoFactorSetupResponse {
  secret: string;
  qr_code: string; // base64 PNG
  url: string;
}

interface TwoFactorStatusResponse {
  enabled: boolean;
}

export function AccountPanel() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [totpCode, setTotpCode] = useState('');
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);

  const { data: twoFactorStatus } = useQuery({
    queryKey: ['2fa', 'status'],
    queryFn: () => api.get<TwoFactorStatusResponse>('/api/v1/auth/2fa/status'),
  });

  const twoFactorEnabled = twoFactorStatus?.enabled ?? false;

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
        <TwoFactorCard
          enabled={twoFactorEnabled}
          setupData={setupData}
          setSetupData={setSetupData}
          totpCode={totpCode}
          setTotpCode={setTotpCode}
          queryClient={queryClient}
        />
      </div>
    </div>
  );
}

// ─── Two-Factor Authentication Card ─────────────────────────────────────────

import type { QueryClient } from '@tanstack/react-query';

function TwoFactorCard({
  enabled,
  setupData,
  setSetupData,
  totpCode,
  setTotpCode,
  queryClient,
}: {
  enabled: boolean;
  setupData: TwoFactorSetupResponse | null;
  setSetupData: (data: TwoFactorSetupResponse | null) => void;
  totpCode: string;
  setTotpCode: (code: string) => void;
  queryClient: QueryClient;
}) {
  const setupMutation = useMutation({
    mutationFn: () => api.post<TwoFactorSetupResponse>('/api/v1/auth/2fa/setup'),
    onSuccess: (data) => {
      setSetupData(data);
    },
    onError: () => toast.error('Failed to start 2FA setup'),
  });

  const verifyMutation = useMutation({
    mutationFn: (code: string) => api.post('/api/v1/auth/2fa/verify', { code }),
    onSuccess: () => {
      toast.success('Two-factor authentication enabled');
      setSetupData(null);
      setTotpCode('');
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
    onError: () => toast.error('Invalid verification code'),
  });

  const disableMutation = useMutation({
    mutationFn: () => api.delete('/api/v1/auth/2fa'),
    onSuccess: () => {
      toast.success('Two-factor authentication disabled');
      setSetupData(null);
      setTotpCode('');
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
    onError: () => toast.error('Failed to disable 2FA'),
  });

  const handleToggle = (checked: boolean) => {
    if (checked) {
      setupMutation.mutate();
    } else {
      disableMutation.mutate();
    }
  };

  return (
    <SettingsCard label="Two-Factor Authentication">
      <p className="mb-4 text-[11px] text-white/40">
        Add an extra layer of security by requiring a TOTP code when signing in.
      </p>

      <div className="flex items-center gap-3">
        <Switch
          id="2fa-toggle"
          checked={enabled || !!setupData}
          onCheckedChange={handleToggle}
          disabled={setupMutation.isPending || disableMutation.isPending}
        />
        <label htmlFor="2fa-toggle" className="text-[12px] text-white/60">
          {enabled ? 'Enabled' : setupData ? 'Pending verification' : 'Disabled'}
        </label>
      </div>

      {/* Setup flow — show QR code and verify input */}
      {setupData && !enabled && (
        <div className="mt-5 space-y-4">
          <p className="text-[11px] text-white/50">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.),
            then enter the 6-digit code to verify.
          </p>
          <img
            src={`data:image/png;base64,${setupData.qr_code}`}
            alt="2FA QR Code"
            className="h-40 w-40 rounded-lg border border-white/[0.08]"
          />
          <div className="space-y-1">
            <p className="text-[10px] text-white/30">
              Manual entry: <code className="font-mono text-white/50">{setupData.secret}</code>
            </p>
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
                maxLength={6}
                className={`${inputClass} w-48 font-mono tracking-widest`}
              />
            </div>
            <Button
              type="button"
              disabled={totpCode.length !== 6 || verifyMutation.isPending}
              onClick={() => verifyMutation.mutate(totpCode)}
            >
              {verifyMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
            </Button>
          </div>
        </div>
      )}

      {/* Already enabled — show status */}
      {enabled && (
        <div className="mt-4">
          <p className="text-[11px] text-green-400/80">
            ✓ Two-factor authentication is active. Toggle off to disable.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}
