import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { Switch } from '@/components/ui/switch';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

const inputClass = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

interface TwoFactorSetupResponse {
  secret: string;
  qr_code: string;
  url: string;
}

interface TwoFactorStatusResponse {
  enabled: boolean;
}

export function AccountPanel() {
  const { i18n } = useLingui();
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
      toast.success(i18n._(msg`account.passwordUpdated`));
      form.reset();
    },
    onError: () => toast.error(i18n._(msg`account.passwordUpdateFailed`)),
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
      <h2 className="text-xl font-bold text-white">
        {i18n._(msg`settings.nav.account`)}
      </h2>
      <p className="mt-1 mb-6 text-xs text-white/35">
        {i18n._(msg`account.subtitle`)}
      </p>

      <div className="space-y-3">
        {/* Profile */}
        <SettingsCard label={i18n._(msg`account.profile`)}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mm-accent/15 text-sm font-semibold text-mm-accent ring-1 ring-mm-accent/25">
              {user?.username?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.username ?? '—'}</p>
              <p className="text-xs text-white/30">ID: {user?.id ?? '—'}</p>
            </div>
          </div>
        </SettingsCard>

        {/* Change Password */}
        <SettingsCard label={i18n._(msg`account.changePassword`)}>
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
                onSubmit: ({ value }) =>
                  !value ? i18n._(msg`account.fieldRequired`) : undefined,
              }}
            >
              {(field) => (
                <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>
                    {i18n._(msg`account.currentPassword`)}
                  </FieldLabel>
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
                  if (!value) return i18n._(msg`account.fieldRequired`);
                  if (value.length < 8) return i18n._(msg`account.passwordMinLength`);
                  return undefined;
                },
              }}
            >
              {(field) => (
                <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>
                    {i18n._(msg`account.newPassword`)}
                  </FieldLabel>
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
                  if (!value) return i18n._(msg`account.fieldRequired`);
                  if (value !== fieldApi.form.getFieldValue('new_password'))
                    return i18n._(msg`account.passwordMismatch`);
                  return undefined;
                },
              }}
            >
              {(field) => (
                <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>
                    {i18n._(msg`account.confirmPassword`)}
                  </FieldLabel>
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
                  {isSubmitting || changePassword.isPending
                    ? i18n._(msg`account.updating`)
                    : i18n._(msg`account.updatePassword`)}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </SettingsCard>

        {/* 2FA */}
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
  const { i18n } = useLingui();

  const setupMutation = useMutation({
    mutationFn: () => api.post<TwoFactorSetupResponse>('/api/v1/auth/2fa/setup'),
    onSuccess: (data) => setSetupData(data),
    onError: () => toast.error(i18n._(msg`account.2fa.setupFailed`)),
  });

  const verifyMutation = useMutation({
    mutationFn: (code: string) => api.post('/api/v1/auth/2fa/verify', { code }),
    onSuccess: () => {
      toast.success(i18n._(msg`account.2fa.enabled`));
      setSetupData(null);
      setTotpCode('');
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
    onError: () => toast.error(i18n._(msg`account.2fa.invalidCode`)),
  });

  const disableMutation = useMutation({
    mutationFn: () => api.delete('/api/v1/auth/2fa'),
    onSuccess: () => {
      toast.success(i18n._(msg`account.2fa.disabled`));
      setSetupData(null);
      setTotpCode('');
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
    onError: () => toast.error(i18n._(msg`account.2fa.disableFailed`)),
  });

  const handleToggle = (checked: boolean) => {
    if (checked) {
      setupMutation.mutate();
    } else {
      disableMutation.mutate();
    }
  };

  return (
    <SettingsCard label={i18n._(msg`account.2fa.title`)}>
      <p className="mb-4 text-xs text-white/40">
        {i18n._(msg`account.2fa.description`)}
      </p>

      {/* Toggle row — label left, switch right */}
      <div className="flex items-center justify-between">
        <label htmlFor="2fa-toggle" className="text-[13px] text-white/60">
          {enabled
            ? i18n._(msg`account.2fa.statusEnabled`)
            : setupData
              ? i18n._(msg`account.2fa.statusPending`)
              : i18n._(msg`account.2fa.statusDisabled`)}
        </label>
        <Switch
          id="2fa-toggle"
          checked={enabled || !!setupData}
          onCheckedChange={handleToggle}
          disabled={setupMutation.isPending || disableMutation.isPending}
        />
      </div>

      {/* Setup flow — centered column */}
      {setupData && !enabled && (
        <div className="mt-5 flex flex-col items-center gap-5">
          <p className="text-[11px] leading-relaxed text-white/45 text-center max-w-sm">
            {i18n._(msg`account.2fa.scanInstructions`)}
          </p>

          {/* QR code */}
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="rounded-md bg-white p-2.5">
              <img
                src={`data:image/png;base64,${setupData.qr_code}`}
                alt="2FA QR Code"
                className="h-32 w-32"
              />
            </div>
            <div className="text-center">
              <p className="text-[8px] uppercase tracking-wider text-white/20">
                {i18n._(msg`account.2fa.manualEntry`)}
              </p>
              <button
                type="button"
                className="mt-0.5 block text-[10px] font-mono text-mm-accent/70 break-all max-w-[200px] cursor-pointer hover:text-mm-accent transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(setupData.secret);
                  toast.success(i18n._(msg`common.copied`));
                }}
                title="Click to copy"
              >
                {setupData.secret}
              </button>
            </div>
          </div>

          {/* Verify input */}
          <div className="flex flex-col items-center gap-2.5">
            <label className="text-[11px] font-medium text-white/50">
              {i18n._(msg`account.2fa.verificationCode`)}
            </label>
            <InputOTP
              maxLength={6}
              value={totpCode}
              onChange={(value) => setTotpCode(value)}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <Button
              type="button"
              className="mt-1 w-full max-w-[240px]"
              disabled={totpCode.length !== 6 || verifyMutation.isPending}
              onClick={() => verifyMutation.mutate(totpCode)}
            >
              {verifyMutation.isPending
                ? i18n._(msg`account.2fa.verifying`)
                : i18n._(msg`account.2fa.verifyEnable`)}
            </Button>
          </div>
        </div>
      )}

      {/* Already enabled */}
      {enabled && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-500/[0.06] px-3 py-2 border border-green-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          <p className="text-xs text-green-400/90">
            {i18n._(msg`account.2fa.activeMessage`)}
          </p>
        </div>
      )}
    </SettingsCard>
  );
}
