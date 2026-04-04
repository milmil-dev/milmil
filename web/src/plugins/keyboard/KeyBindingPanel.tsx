import { useState, useCallback, useEffect, useRef } from 'react';
import { usePreferencesStore } from '@/store/preferences-store';
import { DEFAULT_BINDINGS, ACTION_LABELS, ACTION_GROUPS } from './defaults';
import type { KeyBinding } from '@/lib/api/preferences';
import { SettingsCard } from '@/components/settings/SettingsCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeBindings(defaults: KeyBinding[], custom: KeyBinding[]): KeyBinding[] {
  const map = new Map(defaults.map((b) => [b.action, b]));
  for (const b of custom) {
    map.set(b.action, b);
  }
  return Array.from(map.values());
}

const KEY_DISPLAY: Record<string, string> = {
  ' ': 'Space',
  ArrowLeft: '\u2190',
  ArrowRight: '\u2192',
  ArrowUp: '\u2191',
  ArrowDown: '\u2193',
  Backspace: '\u232B',
};

function formatBinding(b: KeyBinding): string {
  const parts = [
    ...(b.modifiers ?? []).map((m) => m.charAt(0).toUpperCase() + m.slice(1)),
    KEY_DISPLAY[b.key] ?? b.key.toUpperCase(),
  ];
  return parts.join(' + ');
}

function isModifierOnly(key: string): boolean {
  return ['Shift', 'Control', 'Alt', 'Meta'].includes(key);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KeyBindingPanel() {
  const keyboardBindings = usePreferencesStore((s) => s.keyboardBindings);
  const updatePreference = usePreferencesStore((s) => s.updatePreference);

  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveBindings = mergeBindings(DEFAULT_BINDINGS, keyboardBindings);

  // Focus the container when we enter capture mode so we receive key events
  useEffect(() => {
    if (capturingAction && containerRef.current) {
      containerRef.current.focus();
    }
  }, [capturingAction]);

  // Allow pressing Escape to cancel capture
  const handleKeyCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (!capturingAction) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setCapturingAction(null);
        setConflict(null);
        return;
      }

      if (isModifierOnly(e.key)) return;

      const newBinding: KeyBinding = {
        action: capturingAction,
        key: e.key,
        modifiers: [
          ...(e.shiftKey ? (['shift'] as const) : []),
          ...(e.ctrlKey ? (['ctrl'] as const) : []),
          ...(e.altKey ? (['alt'] as const) : []),
          ...(e.metaKey ? (['meta'] as const) : []),
        ],
      };

      // Conflict detection
      const conflicting = effectiveBindings.find(
        (b) =>
          b.action !== capturingAction &&
          b.key === newBinding.key &&
          JSON.stringify(b.modifiers ?? []) === JSON.stringify(newBinding.modifiers ?? []),
      );

      if (conflicting) {
        setConflict(
          `Conflicts with "${ACTION_LABELS[conflicting.action] ?? conflicting.action}"`,
        );
      } else {
        setConflict(null);
      }

      const updated = [
        ...keyboardBindings.filter((b) => b.action !== capturingAction),
        newBinding,
      ];
      updatePreference('keyboardBindings', updated);
      setCapturingAction(null);
    },
    [capturingAction, effectiveBindings, keyboardBindings, updatePreference],
  );

  const handleReset = () => {
    updatePreference('keyboardBindings', []);
    setConflict(null);
  };

  const bindingFor = (action: string): KeyBinding | undefined =>
    effectiveBindings.find((b) => b.action === action);

  const isCustom = (action: string): boolean =>
    keyboardBindings.some((b) => b.action === action);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyCapture}
      className="outline-none"
    >
      <SettingsCard label="Keyboard Shortcuts">
        <div className="space-y-5">
          {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
            <div key={group}>
              {/* Group header */}
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-white/30">
                {group}
              </div>

              {/* Binding rows */}
              <div className="space-y-1">
                {actions.map((action) => {
                  const binding = bindingFor(action);
                  const capturing = capturingAction === action;
                  const custom = isCustom(action);

                  return (
                    <div
                      key={action}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
                    >
                      {/* Action label */}
                      <span className="text-sm text-white/70">
                        {ACTION_LABELS[action] ?? action}
                      </span>

                      {/* Key badge — click to rebind */}
                      <button
                        type="button"
                        onClick={() => {
                          setCapturingAction(action);
                          setConflict(null);
                        }}
                        className={[
                          'min-w-[60px] rounded-lg px-3 py-1 text-center font-mono text-xs transition-all',
                          capturing
                            ? 'animate-pulse border border-white/40 bg-white/15 text-white'
                            : custom
                              ? 'border border-white/15 bg-white/10 text-white/90'
                              : 'border border-white/[0.06] bg-white/[0.05] text-white/60',
                        ].join(' ')}
                      >
                        {capturing
                          ? 'Press a key\u2026'
                          : binding
                            ? formatBinding(binding)
                            : '\u2014'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Conflict warning */}
          {conflict && (
            <p className="text-xs text-amber-400/80">{conflict}</p>
          )}

          {/* Reset button */}
          <button
            type="button"
            onClick={handleReset}
            disabled={keyboardBindings.length === 0}
            className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Reset to Defaults
          </button>
        </div>
      </SettingsCard>
    </div>
  );
}
