import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Field, FieldLabel } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import { useDocumentTitle } from '../../hooks/use-document-title';
import type { CreateLibraryInput } from '../../lib/api/library';
import { libraryApi } from '../../lib/api/library';

type PathStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

const DEFAULT_PATH = '/media';
const DEFAULT_SCAN_INTERVAL_MIN = 60;

export function LibraryStep() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`setup.library.title`));
  const navigate = useNavigate();
  const [pathStatus, setPathStatus] = useState<PathStatus>({ kind: 'idle' });
  const [submitError, setSubmitError] = useState('');
  const inflightPathRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function checkPath(rawPath: string) {
    const path = rawPath.trim();
    if (!path) {
      setPathStatus({ kind: 'idle' });
      return;
    }
    inflightPathRef.current = path;
    setPathStatus({ kind: 'checking' });
    try {
      const res = await libraryApi.testConnection({
        source_type: 'local',
        source_config: {},
        path,
      });
      if (!mountedRef.current) return;
      if (inflightPathRef.current !== path) return; // stale — newer check superseded us
      if (res.ok) {
        setPathStatus({ kind: 'ok' });
      } else {
        setPathStatus({
          kind: 'error',
          message: res.error ?? i18n._(msg`setup.library.pathInvalid`),
        });
      }
    } catch {
      if (!mountedRef.current) return;
      if (inflightPathRef.current !== path) return;
      setPathStatus({ kind: 'error', message: i18n._(msg`setup.library.pathCheckFailed`) });
    }
  }

  const form = useForm({
    defaultValues: { name: '', path: DEFAULT_PATH },
    onSubmit: async ({ value }) => {
      setSubmitError('');
      if (pathStatus.kind === 'error') {
        setSubmitError(i18n._(msg`setup.library.fixPathFirst`));
        return;
      }
      const input: CreateLibraryInput = {
        name: value.name.trim(),
        path: value.path.trim(),
        source_type: 'local',
        source_config: {},
        scan_interval_minutes: DEFAULT_SCAN_INTERVAL_MIN,
      };
      try {
        const lib = await libraryApi.create(input);
        // Fire-and-forget scan — don't block the redirect on it.
        libraryApi.scan(lib.id).catch((err) => {
          // Best-effort: scan kickoff failed (network/auth/server error). User can retry
          // from Settings → Library → Scan. Log so it shows up in dev console / sentry.
          console.error('Initial scan kickoff failed for library', lib.id, err);
        });
        navigate({ to: '/setup/integrations' });
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : i18n._(msg`setup.library.createFailed`)
        );
      }
    },
  });

  return (
    <>
      <h2 className="text-lg font-semibold text-ink mb-1">{i18n._(msg`setup.library.title`)}</h2>
      <p className="text-[13px] text-ink/40 mb-6">{i18n._(msg`setup.library.subtitle`)}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{i18n._(msg`setup.library.nameLabel`)}</FieldLabel>
              <Input
                id={field.name}
                type="text"
                autoComplete="off"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`setup.library.namePlaceholder`)}
                required
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="path">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{i18n._(msg`setup.library.pathLabel`)}</FieldLabel>
              <Input
                id={field.name}
                type="text"
                autoComplete="off"
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  // Reset to idle while typing — only re-check on blur.
                  if (pathStatus.kind !== 'idle') setPathStatus({ kind: 'idle' });
                }}
                onBlur={() => checkPath(field.state.value)}
                placeholder={i18n._(msg`setup.library.pathPlaceholder`)}
                required
              />
              <PathStatusLine status={pathStatus} />
            </Field>
          )}
        </form.Field>

        {submitError && <p className="text-red-400 text-sm">{submitError}</p>}

        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              disabled={
                isSubmitting || pathStatus.kind === 'checking' || pathStatus.kind === 'error'
              }
              className="w-full"
            >
              {isSubmitting
                ? i18n._(msg`setup.library.creating`)
                : i18n._(msg`setup.library.submit`)}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </>
  );
}

function PathStatusLine({ status }: { status: PathStatus }) {
  const { i18n } = useLingui();
  if (status.kind === 'idle') return null;
  if (status.kind === 'checking') {
    return (
      <p className="mt-2 flex items-center gap-2 text-[12px] text-ink/50">
        <Spinner className="h-3 w-3" size={12} />
        {i18n._(msg`setup.library.pathChecking`)}
      </p>
    );
  }
  if (status.kind === 'ok') {
    return (
      <p className="mt-2 text-[12px] text-emerald-400">
        ✓ {i18n._(msg`setup.library.pathReadable`)}
      </p>
    );
  }
  return <p className="mt-2 text-[12px] text-red-400">✗ {status.message}</p>;
}
