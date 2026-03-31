import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "../components/ui/button"
import { Field, FieldError, FieldLabel } from "../components/ui/field"
import { Input } from "../components/ui/input"
import { PasswordInput } from "../components/ui/password-input"
import { Spinner } from "../components/ui/spinner"
import { useAuth } from "../hooks/use-auth"
import { discoverApi, discoverKeys } from "../lib/api/discover"
import { api } from "../lib/api-client"

/* ── Poster collage background ─────────────────────────────── */

function PosterCollage() {
  const { data: trending } = useQuery({
    queryKey: discoverKeys.trending(1),
    queryFn: () => discoverApi.trending(1),
    staleTime: 5 * 60 * 1000,
  })

  // Pick posters with valid cover images, fill to 24 slots
  const posters = useMemo(() => {
    if (!trending) return []
    const valid = trending
      .filter((a) => a.cover_image?.startsWith("http"))
      .map((a) => a.cover_image)
    // Duplicate to fill grid if fewer than 24
    const result: string[] = []
    while (result.length < 24 && valid.length > 0) {
      result.push(...valid)
    }
    return result.slice(0, 24)
  }, [trending])

  if (posters.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Poster grid — rotated for visual interest */}
      <div
        className="absolute -inset-[20%]"
        style={{ transform: "rotate(-12deg) scale(1.3)" }}
      >
        <div className="grid grid-cols-6 gap-1.5 opacity-[0.45]">
          {posters.map((src, i) => (
            <motion.div
              key={`${src}-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04, duration: 0.8 }}
              className="aspect-[3/4] overflow-hidden rounded-sm"
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Dark overlay — ensures form readability */}
      <div className="absolute inset-0 bg-mm-bg/50" />

      {/* Vignette — darker edges */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, var(--mm-bg) 80%)",
        }}
      />

      {/* Accent glow behind form area */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-mm-accent/[0.04] blur-[120px]" />
    </div>
  )
}

/* ── Main login page ───────────────────────────────────────── */

export function LoginPage() {
  const { i18n } = useLingui()
  const navigate = useNavigate()
  const { login, setup, loading, error, clearError } = useAuth()

  // Check if admin user already exists
  const { data: status } = useQuery({
    queryKey: ["auth", "status"],
    queryFn: () => api.get<{ initialized: boolean }>("/api/v1/auth/status"),
  })
  const isInitialized = status?.initialized ?? true

  const [mode, setMode] = useState<"login" | "setup">("login")
  const [localError, setLocalError] = useState("")

  const form = useForm({
    defaultValues: { username: "", password: "" },
    onSubmit: async ({ value }) => {
      setLocalError("")

      if (mode === "setup" && value.password.length < 8) {
        setLocalError(i18n._(msg`auth.setup.passwordTooShort`))
        return
      }

      try {
        if (mode === "login") {
          await login(value.username, value.password)
        } else {
          await setup(value.username, value.password)
        }
        form.reset()
        navigate({ to: "/" })
      } catch {
        // error is set by useAuth
      }
    },
  })

  // Auto-switch to setup if not initialized
  useEffect(() => {
    if (status && !status.initialized) {
      setMode("setup")
    }
  }, [status])

  function switchMode(newMode: "login" | "setup") {
    form.reset()
    setLocalError("")
    clearError()
    setMode(newMode)
  }

  const displayError = localError || error

  return (
    <div className="relative min-h-screen bg-mm-bg flex items-center justify-center p-4">
      <PosterCollage />

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
          <h1 className="text-xl font-semibold text-white tracking-tight">
            milmil
          </h1>
          <p className="mt-1 text-[13px] text-white/30">
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
          {/* Mode tabs — only show if not initialized */}
          {!isInitialized && (
            <div className="mb-6 flex border-b border-white/[0.06]">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${
                  mode === "login"
                    ? "text-white border-b-2 border-mm-accent"
                    : "text-white/30 hover:text-white/50"
                }`}
              >
                {i18n._(msg`auth.login.title`)}
              </button>
              <button
                type="button"
                onClick={() => switchMode("setup")}
                className={`flex-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${
                  mode === "setup"
                    ? "text-white border-b-2 border-mm-accent"
                    : "text-white/30 hover:text-white/50"
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

          {mode === "setup" && (
            <p className="mb-4 text-[13px] text-white/40">
              {i18n._(msg`auth.setup.subtitle`)}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="space-y-5"
          >
            <form.Field name="username">
              {(field) => (
                <Field
                  data-invalid={
                    field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0
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
                    field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0
                  }
                >
                  <FieldLabel htmlFor={field.name}>
                    {i18n._(msg`auth.login.password`)}
                  </FieldLabel>
                  <PasswordInput
                    id={field.name}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
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

            {displayError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[13px] text-red-400"
              >
                {displayError}
              </motion.p>
            )}

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
                        {mode === "login"
                          ? i18n._(msg`auth.login.submit`)
                          : i18n._(msg`auth.setup.submit`)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              )}
            </form.Subscribe>
          </form>
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
  )
}
