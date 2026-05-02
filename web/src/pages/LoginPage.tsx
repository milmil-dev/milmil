import { ForgotPasswordIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Field, FieldError, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '../components/ui/input-otp';
import { PasswordInput } from '../components/ui/password-input';
import { Spinner } from '../components/ui/spinner';
import { useAuth } from '../hooks/use-auth';
import { useDocumentTitle } from '../hooks/use-document-title';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { api } from '../lib/api-client';

/* ── Poster wall background (cinema-style grid with perspective tilt) ── */

function PosterWall() {
  const { data: trending } = useQuery({
    queryKey: discoverKeys.trending(1),
    queryFn: () => discoverApi.trending(1),
    staleTime: 5 * 60 * 1000,
  });

  // 210 slots (14 cols × 15 rows) — repeat the list if fewer than that many covers
  const posters = useMemo(() => {
    const SLOTS = 210;
    if (!trending) return [];
    const valid = trending
      .filter((a) => a.cover_image?.startsWith('http'))
      .map((a) => a.cover_image);
    if (valid.length === 0) return [];
    const result: Array<{ key: string; src: string }> = [];
    while (result.length < SLOTS) {
      for (const src of valid) {
        result.push({ key: `${result.length}-${src}`, src });
        if (result.length >= SLOTS) break;
      }
    }
    return result.slice(0, SLOTS);
  }, [trending]);

  if (posters.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-mm-bg">
      {/* Tilted poster grid — posters sit at full opacity; darkness comes from overlays */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-[-40%] right-[-40%] top-[-20%] bottom-[-20%]"
        style={{
          transform: 'perspective(1400px) rotateY(-22deg) rotateZ(2deg)',
          transformOrigin: '50% 50%',
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          className="grid gap-x-[5px] gap-y-[10px]"
          style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}
        >
          {posters.map(({ key, src }) => (
            <div key={key} className="aspect-[2/3] overflow-hidden rounded-[3px]">
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Flat dark overlay — evenly dims whole wall so posters are visible but subdued */}
      <div className="absolute inset-0 bg-black/55" />

      {/* Vignette — fades edges darker, centre stays lighter so form reads well */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 0%, rgba(7,7,7,0.35) 70%, var(--mm-bg) 100%)',
        }}
      />

      {/* Accent glow behind form area */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-mm-accent/[0.05] blur-[120px]" />
    </div>
  );
}

function AuthErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-400/[0.18] bg-red-500/[0.09] px-3.5 py-3 text-left shadow-[0_14px_32px_rgba(120,24,24,0.18)]"
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-400/15 text-[13px] font-bold leading-none text-red-200 ring-1 ring-red-300/20">
        !
      </span>
      <p className="text-[13px] font-medium leading-5 text-red-100">{children}</p>
    </motion.div>
  );
}

/* ── Main login page ───────────────────────────────────────── */

export function LoginPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`auth.login.title`));
  const navigate = useNavigate();
  const { login, setup, verify2FA, cancel2FA, pending2FA, loading, error, clearError } = useAuth();
  const [totpCode, setTotpCode] = useState('');

  // Check if admin user already exists
  const { data: status } = useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => api.get<{ initialized: boolean }>('/api/v1/auth/status'),
  });
  const isInitialized = status?.initialized ?? true;

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
          // If pending2FA is set, login() returned early — don't navigate
          if (!pending2FA) {
            form.reset();
            navigate({ to: '/' });
          }
        } else {
          await setup(value.username, value.password);
          form.reset();
          navigate({ to: '/' });
        }
      } catch {
        // error is set by useAuth
      }
    },
  });

  // Auto-switch to setup if not initialized
  useEffect(() => {
    if (status && !status.initialized) {
      setMode('setup');
    }
  }, [status]);

  function switchMode(newMode: 'login' | 'setup') {
    form.reset();
    setLocalError('');
    clearError();
    setMode(newMode);
  }

  const displayError = localError || error;

  return (
    <div className="relative min-h-screen bg-mm-bg flex items-center justify-center p-4">
      <PosterWall />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 w-full max-w-[380px]"
      >
        {/* Brand header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mb-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mm-accent/10 ring-1 ring-mm-accent/20 backdrop-blur-sm">
            <span className="text-lg font-bold text-mm-accent">M</span>
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">milmil</h1>
          <p className="mt-1 text-[13px] font-medium text-white/60 drop-shadow-sm">
            {i18n._(msg`auth.login.subtitle`)}
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="rounded-xl border border-white/[0.06] bg-mm-bg/70 p-8 backdrop-blur-xl shadow-2xl shadow-black/50"
        >
          {/* 2FA verification step */}
          {pending2FA ? (
            <div className="space-y-5">
              <div>
                <h2 className="mb-1 text-lg font-semibold text-white">
                  {i18n._(msg`auth.2fa.title`)}
                </h2>
                <p className="text-[13px] text-white/40">{i18n._(msg`auth.2fa.subtitle`)}</p>
              </div>

              <div>
                <p
                  id="totp-code-label"
                  className="mb-2 block text-[13px] font-medium text-white/60"
                >
                  {i18n._(msg`auth.2fa.codeLabel`)}
                </p>
                <InputOTP
                  aria-labelledby="totp-code-label"
                  maxLength={6}
                  value={totpCode}
                  onChange={(value) => setTotpCode(value)}
                  onComplete={(value) => {
                    verify2FA(value)
                      .then(() => {
                        navigate({ to: '/' });
                      })
                      .catch(() => {});
                  }}
                  autoFocus
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
              </div>

              <AnimatePresence>
                {displayError && <AuthErrorAlert>{displayError}</AuthErrorAlert>}
              </AnimatePresence>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    cancel2FA();
                    setTotpCode('');
                  }}
                  className="flex-1"
                >
                  {i18n._(msg`common.back`)}
                </Button>
                <Button
                  type="button"
                  disabled={totpCode.length !== 6 || loading}
                  onClick={() => {
                    verify2FA(totpCode)
                      .then(() => {
                        navigate({ to: '/' });
                      })
                      .catch(() => {});
                  }}
                  className="flex-1"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size={16} aria-hidden="true" />
                      {i18n._(msg`common.loading`)}
                    </span>
                  ) : (
                    i18n._(msg`auth.2fa.verify`)
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Mode tabs — only show if not initialized */}
              {!isInitialized && (
                <div className="mb-6 flex border-b border-white/[0.06]">
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
              )}

              {isInitialized && (
                <h2 className="mb-6 text-lg font-semibold text-white">
                  {i18n._(msg`auth.login.title`)}
                </h2>
              )}

              {mode === 'setup' && (
                <p className="mb-4 text-[13px] text-white/40">{i18n._(msg`auth.setup.subtitle`)}</p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
                className="space-y-5"
              >
                <form.Field name="username">
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                    >
                      <FieldLabel htmlFor={field.name}>
                        {i18n._(msg`auth.login.username`)}
                      </FieldLabel>
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
                      data-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                    >
                      <FieldLabel htmlFor={field.name}>
                        {i18n._(msg`auth.login.password`)}
                      </FieldLabel>
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

                <AnimatePresence>
                  {displayError && <AuthErrorAlert>{displayError}</AuthErrorAlert>}
                </AnimatePresence>

                <form.Subscribe selector={(s) => s.isSubmitting}>
                  {(isSubmitting) => (
                    <Button
                      type="submit"
                      disabled={loading || isSubmitting}
                      size="lg"
                      className="w-full"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {loading || isSubmitting ? (
                          <motion.span
                            key="loading"
                            initial={{ opacity: 0, y: 4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="inline-flex items-center justify-center gap-2"
                          >
                            <Spinner size={16} aria-hidden="true" />
                            {i18n._(msg`common.loading`)}
                          </motion.span>
                        ) : (
                          <motion.span
                            key={mode}
                            initial={{ opacity: 0, y: 4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="inline-flex items-center justify-center"
                          >
                            {mode === 'login'
                              ? i18n._(msg`auth.login.submit`)
                              : i18n._(msg`auth.setup.submit`)}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Button>
                  )}
                </form.Subscribe>

                {isInitialized && mode === 'login' && (
                  <details className="group rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center justify-center gap-2 text-center text-[12px] font-medium text-white/40 transition-colors hover:text-white/65 marker:hidden">
                      <span className="flex size-5 items-center justify-center rounded-full bg-white/[0.04] text-white/35 transition-colors group-open:text-mm-accent group-hover:text-white/55">
                        <HugeiconsIcon icon={ForgotPasswordIcon} size={13} strokeWidth={1.8} />
                      </span>
                      <span>{i18n._(msg`auth.login.forgotPassword`)}</span>
                    </summary>
                    <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-2 text-[12px] leading-relaxed text-white/35">
                      <p>{i18n._(msg`auth.login.recoveryNoEmail`)}</p>
                      <code className="block overflow-x-auto rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white/60">
                        {
                          'docker compose exec api /app/milmil-api admin reset-password --username admin --password-stdin'
                        }
                      </code>
                      <p>{i18n._(msg`auth.login.recoveryAccessRequired`)}</p>
                    </div>
                  </details>
                )}
              </form>
            </>
          )}
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-6 text-center text-[11px] text-white/15"
        >
          milmil — Personal Anime Media Server
        </motion.p>
      </motion.div>
    </div>
  );
}
