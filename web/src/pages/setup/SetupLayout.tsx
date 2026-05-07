import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';

const STEPS: ReadonlyArray<{
  key: 'admin' | 'library' | 'integrations';
  labelMsg: ReturnType<typeof msg>;
}> = [
  { key: 'admin', labelMsg: msg`setup.step.admin` },
  { key: 'library', labelMsg: msg`setup.step.library` },
  { key: 'integrations', labelMsg: msg`setup.step.integrations` },
];

export function SetupLayout() {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = STEPS.findIndex((s) => pathname.endsWith(`/${s.key}`));
  const safeIndex = activeIndex < 0 ? 0 : activeIndex;
  const activeStep = STEPS[safeIndex] ?? STEPS[0]!;
  const activeLabel = i18n._(activeStep.labelMsg);

  return (
    <div className="relative min-h-screen bg-mm-bg flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mm-accent/10 ring-1 ring-mm-accent/20">
            <span className="text-lg font-semibold text-mm-accent">M</span>
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">milmil</h1>
          <p className="mt-2 text-[12px] uppercase tracking-wider text-white/40">{activeLabel}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={
                  i <= safeIndex
                    ? 'h-1.5 w-1.5 rounded-full bg-white/80'
                    : 'h-1.5 w-1.5 rounded-full bg-white/15'
                }
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-mm-bg/70 p-8 backdrop-blur-xl shadow-2xl shadow-black/50">
          <Outlet />
        </div>
      </motion.div>
    </div>
  );
}
