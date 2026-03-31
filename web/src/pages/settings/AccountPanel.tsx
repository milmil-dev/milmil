import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

const inputClass = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

export function AccountPanel() {
  const user = useAuthStore((s) => s.user);

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h2 className="text-[18px] font-bold text-white">Account</h2>
      <p className="mt-1 mb-6 text-[11px] text-white/35">
        Manage your profile and security settings
      </p>

      <div className="max-w-2xl space-y-3">
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
      </div>
    </motion.div>
  );
}
