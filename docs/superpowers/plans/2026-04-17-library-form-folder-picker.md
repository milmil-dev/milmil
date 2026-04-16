# Library Form Folder Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified "Browse…" folder-picker modal for library sources (local + remote), triggered by a folder icon inside the path input. Also merge the wizard's source-type header into a single row.

**Architecture:** Refactor the existing `FolderBrowser` in `LibrariesPage.tsx` to extract a `FolderBrowserCore` sub-component that can render either inline (current SMB-discovery use case) or inside a `Dialog` (new `FolderPickerDialog`). The path input gains an absolutely-positioned folder icon button that opens the dialog. Starting path is remembered per source type in `localStorage`.

**Tech Stack:** React 19, TanStack Form, TanStack Query (existing `browseMutation`), shadcn `Dialog` (radix-ui), Lingui v5, `@hugeicons/core-free-icons` (`FolderOpenIcon`), Playwright for E2E. No backend changes.

**Reference spec:** `docs/superpowers/specs/2026-04-17-library-form-folder-picker-design.md`

---

## File Structure

Single primary file touched (`LibrariesPage.tsx`) — the file is already 3400 lines and houses the entire libraries UI. The plan does **not** attempt to split it; the internal extraction (`FolderBrowser` → `FolderBrowserCore` + `FolderPickerDialog`) is a contained refactor that does not warrant a split.

| Path | Action | Responsibility |
|---|---|---|
| `web/src/pages/LibrariesPage.tsx` | Modify | Internal refactor of `FolderBrowser` + new `FolderPickerDialog` + two rewire points + one source-header row merge |
| `web/src/locales/{en,ja,ko,zh-CN,zh-HK,zh-TW}/messages.po` | Modify | 6 new i18n keys |
| `web/src/locales/*/messages.ts` | Regenerate | Compiled from `.po` by `bun run i18n:compile` |
| `web/e2e/library-folder-picker.spec.ts` | Create | Playwright E2E covering open-modal → navigate → select → path populated |

No backend files, no migrations, no new dependencies.

---

## Task 0: Create isolated worktree

**Files:** none modified yet

- [ ] **Step 1: Invoke the git-worktrees skill**

The user's feedback requires new feature work in milmil to happen in an isolated worktree (not on `main`). Invoke `superpowers:using-git-worktrees` to create a worktree on branch `feature/library-folder-picker`.

The worktree must:
- Be created from current `main`
- Symlink only `web/.env` and `api/.env` (if they exist); **never** symlink `api/data`, `data/`, or any runtime directory (memory: `feedback_no_symlink_data`)
- Install deps with `bun install` in the worktree's `web/`

- [ ] **Step 2: Confirm you're inside the worktree**

Run: `git rev-parse --show-toplevel && git branch --show-current`
Expected: path ending in `.claude/worktrees/...` and branch `feature/library-folder-picker`.

All subsequent commands run from the worktree root.

---

## Task 1: Add i18n keys

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/ja/messages.po`
- Modify: `web/src/locales/ko/messages.po`
- Modify: `web/src/locales/zh-CN/messages.po`
- Modify: `web/src/locales/zh-HK/messages.po`
- Modify: `web/src/locales/zh-TW/messages.po`

- [ ] **Step 1: Append new message entries to each `.po` file**

Append these six `msgid`/`msgstr` pairs to each locale file. Each `.po` entry looks like:

```
msgid "library.browseFolder"
msgstr "<translation>"
```

Translations per locale:

| msgid | en | zh-TW | zh-HK | zh-CN | ja | ko |
|---|---|---|---|---|---|---|
| `library.browseFolder` | Browse folder | 瀏覽資料夾 | 瀏覽資料夾 | 浏览文件夹 | フォルダを参照 | 폴더 찾아보기 |
| `library.folderPicker.title` | Select folder | 選擇資料夾 | 選擇資料夾 | 选择文件夹 | フォルダを選択 | 폴더 선택 |
| `library.folderPicker.pathPlaceholder` | Paste a path and press Enter | 輸入路徑後按 Enter | 輸入路徑後按 Enter | 输入路径后按 Enter | パスを入力して Enter | 경로를 입력하고 Enter |
| `library.folderPicker.select` | Select this folder | 選擇此資料夾 | 選擇此資料夾 | 选择此文件夹 | このフォルダを選択 | 이 폴더 선택 |
| `library.folderPicker.cancel` | Cancel | 取消 | 取消 | 取消 | キャンセル | 취소 |
| `library.folderPicker.invalidPath` | Path not found | 找不到路徑 | 找不到路徑 | 找不到路径 | パスが見つかりません | 경로를 찾을 수 없습니다 |

Use the same `.po` syntax already present in each file (look at existing `library.*` entries for reference).

- [ ] **Step 2: Compile translations**

Run: `cd web && bun run i18n:compile`
Expected: all `messages.ts` files regenerate without error. Compilation output confirms six new keys per locale.

- [ ] **Step 3: Verify the new keys surface in type completions**

Run: `cd web && bun run typecheck`
Expected: passes. (No TS errors — at this point no TSX references the new keys yet; compile just confirms nothing broke.)

- [ ] **Step 4: Commit**

```bash
git add web/src/locales
git commit -m "i18n(libraries): add folder picker message keys"
```

---

## Task 2: Extract `FolderBrowserCore` from `FolderBrowser`

This is a behavior-preserving refactor. After it, the existing SMB-discovery usage must still work exactly the same way.

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx:419-740` (existing `FolderBrowser` function body)

- [ ] **Step 1: Read the current `FolderBrowser` in full**

Read lines 419 through ~740 (the closing brace of `FolderBrowser`) to internalize the state, effects, and render logic. Pay attention to the props: `sourceType`, `getSourceConfig`, `currentPath`, `onSelect`, `onShareSelect`, `autoLoad`, `height`.

- [ ] **Step 2: Introduce a `FolderBrowserCore` component beside `FolderBrowser`**

Define a new internal component that holds the browsing state and renders only the **breadcrumb + listing + loading/empty states** (no outer "Select this folder" button — the caller decides how to wrap). It exposes via props everything a caller needs to select a folder.

```tsx
interface FolderBrowserCoreProps {
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  /** Initial path to browse when the core mounts or `autoLoad` is true */
  initialPath?: string;
  onShareSelect?: (share: string) => void;
  /** Called every time the *current browse location* changes, so the wrapping dialog/inline shell can enable its Select button and show the path */
  onBrowsePathChange?: (path: string) => void;
  /** When true, auto-loads `initialPath` (or `/`) on mount */
  autoLoad?: boolean;
  height?: number;
}

function FolderBrowserCore({
  sourceType,
  getSourceConfig,
  initialPath,
  onShareSelect,
  onBrowsePathChange,
  autoLoad,
  height = 200,
}: FolderBrowserCoreProps) {
  const { i18n } = useLingui();
  const [browsePath, setBrowsePath] = useState(initialPath && initialPath !== '' ? initialPath : '/');
  const [directories, setDirectories] = useState<BrowseEntry[]>([]);
  const [isShareLevel, setIsShareLevel] = useState(false);
  const [selectedShare, setSelectedShare] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const browseMutation = useMutation({
    mutationFn: (input: BrowseInput) => libraryApi.browse(input),
    onSuccess: (data) => {
      setDirectories(data.directories ?? []);
      setIsNavigating(false);
      setHasLoaded(true);
    },
    onError: () => {
      setIsNavigating(false);
    },
  });

  const doBrowse = (path: string, overrideConfig?: Record<string, unknown>) => {
    if (browseMutation.isPending) return;
    const config = overrideConfig ?? getSourceConfig();
    const noShare = sourceType === 'smb' && !config.share;
    setIsShareLevel(noShare && (path === '/' || path === ''));
    setIsNavigating(true);
    setBrowsePath(path);
    onBrowsePathChange?.(path);
    browseMutation.mutate({
      source_type: sourceType,
      source_config: config,
      path,
    });
  };

  useEffect(() => {
    if (autoLoad) {
      doBrowse(initialPath && initialPath !== '' ? initialPath : '/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [autoLoad]);

  const breadcrumbs = browsePath === '/' ? [] : browsePath.split('/').filter(Boolean);
  const displayBreadcrumbs = selectedShare ? [selectedShare, ...breadcrumbs] : breadcrumbs;

  const handleCrumbClick = (index: number) => {
    if (selectedShare) {
      if (index === 0) {
        setSelectedShare('');
        const config = getSourceConfig();
        delete config.share;
        doBrowse('/', config);
        return;
      }
      const realIndex = index - 1;
      if (realIndex < 0) {
        doBrowse('/');
      } else {
        doBrowse('/' + breadcrumbs.slice(0, realIndex + 1).join('/'));
      }
    } else {
      if (index < 0) {
        doBrowse('/');
      } else {
        doBrowse('/' + breadcrumbs.slice(0, index + 1).join('/'));
      }
    }
  };

  const handleDirectoryClick = (entry: BrowseEntry) => {
    if (isShareLevel && sourceType === 'smb') {
      setSelectedShare(entry.name);
      if (onShareSelect) onShareSelect(entry.name);
      const config = getSourceConfig();
      config.share = entry.name;
      doBrowse('/', config);
      return;
    }
    doBrowse(entry.path);
  };

  // Return the breadcrumb + listing JSX.
  // COPY verbatim from the current `FolderBrowser` body: the entire contents of the
  // `{(browseMutation.isSuccess || browseMutation.isPending) && ( ... )}` block
  // (currently ~lines 542-725 in LibrariesPage.tsx) — but drop the outer
  // `{(browseMutation.isSuccess || browseMutation.isPending) && (...)}` guard
  // and return the inner JSX unconditionally. The `handleDirectoryClick` /
  // `handleCrumbClick` handlers used inside that JSX are already defined above.
  return (
    <>
      {/* paste the inner <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden"> ... </div> block here */}
    </>
  );
}
```

**Concrete copy guidance:** open the current `FolderBrowser` function (line 419). Its return looks like:

```tsx
return (
  <div className="space-y-2">
    <div className="flex items-center justify-between">{/* header + Browse Folders button */}</div>
    {(browseMutation.isSuccess || browseMutation.isPending) && (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {/* breadcrumb + listing */}
      </div>
    )}
  </div>
);
```

For `FolderBrowserCore`, return **only** the `<div className="rounded-lg border ...">` block (the breadcrumb + directory listing), unconditionally. The header row and the "(browseMutation.isSuccess || isPending)" guard move to `FolderBrowser` wrapper in Step 3 (so inline callers still get the "click Browse Folders to start" behavior), and the dialog uses `autoLoad` so the first browse fires on open.

Preserve every className, motion prop, key, and condition inside the copied block. Zero visual or behavior change for the inline caller is the goal.

- [ ] **Step 3: Rewrite `FolderBrowser` as a thin wrapper over `FolderBrowserCore`**

Replace the old `FolderBrowser` body. The new wrapper keeps its existing public signature:

```tsx
function FolderBrowser({
  sourceType,
  getSourceConfig,
  currentPath,
  onSelect,
  onShareSelect,
  autoLoad,
  height = 200,
}: {
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  currentPath: string;
  onSelect: (path: string) => void;
  onShareSelect?: (share: string) => void;
  autoLoad?: boolean;
  height?: number;
}) {
  const { i18n } = useLingui();
  const [browsePath, setBrowsePath] = useState('/');
  const [opened, setOpened] = useState(!!autoLoad);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 hover:text-white/60 transition-colors cursor-pointer"
        >
          {i18n._(msg`library.browse.folders`)}
        </button>
      </div>
      {opened && (
        <>
          <FolderBrowserCore
            sourceType={sourceType}
            getSourceConfig={getSourceConfig}
            initialPath={currentPath}
            autoLoad
            onShareSelect={onShareSelect}
            onBrowsePathChange={setBrowsePath}
            height={height}
          />
          {browsePath !== '' && (
            <button
              type="button"
              onClick={() => onSelect(browsePath)}
              className={cn(
                'w-full px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer flex items-center justify-center gap-2',
                currentPath === browsePath
                  ? 'bg-mm-accent/15 border border-mm-accent/30 text-mm-accent'
                  : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80'
              )}
            >
              {currentPath === browsePath ? (
                <>
                  <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                    <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {i18n._(msg`library.browse.selected`)}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-white/40">
                    <path d="M3 6a2 2 0 0 1 2-2h3.5l2 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  {i18n._(msg`library.browse.select`)}
                  <span className="font-mono text-xs text-white/40">{browsePath}</span>
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

This is a straight port of the existing `FolderBrowser` markup (the select button JSX is copied verbatim from the current lines ~695-732). It uses the existing `library.browse.folders`, `library.browse.select`, and `library.browse.selected` keys already in every `.po` file. No new keys beyond Task 1.

- [ ] **Step 4: Typecheck + build to catch regressions**

Run: `cd web && bun run typecheck`
Expected: passes with no errors.

- [ ] **Step 5: Manual smoke test of the existing inline use case**

(The dev server is not started automatically — per `web/AGENTS.md`, ask the user to run `bun run dev` if it isn't running, and verify the SMB "browse folders" discovery step still works. If the user isn't available, skip this and rely on the typecheck + the later E2E run.)

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx web/src/locales
git commit -m "refactor(libraries): extract FolderBrowserCore from FolderBrowser"
```

---

## Task 3: Create `FolderPickerDialog` component

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx` (add import, add component definition)

- [ ] **Step 1: Add imports at the top of the file**

Find the existing Hugeicons import block (grep for `@hugeicons/core-free-icons` — around the imports section). Add `FolderOpenIcon` to it. Add the dialog imports if not already present:

```tsx
import {
  // ...existing imports...
  FolderOpenIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
```

Check existing imports first — `HugeiconsIcon` and `@hugeicons/core-free-icons` may already be imported. Don't duplicate.

- [ ] **Step 2: Add a localStorage helper near the top of the file (after the existing `formatBytes` helper around line 53)**

```tsx
const LAST_BROWSE_PATH_PREFIX = 'milmil.lastBrowsePath.';

function getLastBrowsePath(sourceType: SourceType): string | null {
  try {
    return localStorage.getItem(`${LAST_BROWSE_PATH_PREFIX}${sourceType}`);
  } catch {
    return null;
  }
}

function setLastBrowsePath(sourceType: SourceType, path: string): void {
  try {
    localStorage.setItem(`${LAST_BROWSE_PATH_PREFIX}${sourceType}`, path);
  } catch {
    // ignore (quota exceeded, private mode, etc.)
  }
}
```

- [ ] **Step 3: Add the `FolderPickerDialog` component definition**

Place it in the file **after** `FolderBrowserCore` and `FolderBrowser` (so forward references work cleanly). The component:

```tsx
function FolderPickerDialog({
  open,
  onOpenChange,
  sourceType,
  getSourceConfig,
  initialPath,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceType: SourceType;
  getSourceConfig: () => Record<string, unknown>;
  initialPath: string;
  onSelect: (path: string) => void;
}) {
  const { i18n } = useLingui();
  const [manualPath, setManualPath] = useState('');
  const [browsePath, setBrowsePath] = useState<string>('');

  // Reset manualPath each time the dialog opens, and resolve the starting path
  const resolvedInitial = useMemo(() => {
    if (initialPath && initialPath !== '') return initialPath;
    const remembered = getLastBrowsePath(sourceType);
    if (remembered) return remembered;
    return '/';
  }, [initialPath, sourceType, open]); // recompute per-open

  useEffect(() => {
    if (open) {
      setManualPath(resolvedInitial);
      setBrowsePath(resolvedInitial);
    }
  }, [open, resolvedInitial]);

  // Child ref — we need to ask the core to jump to a path when user presses Enter in manualPath.
  // Simplest approach: remount the core with a new key when manualPath changes via Enter.
  const [coreKey, setCoreKey] = useState(0);
  const [pendingInitial, setPendingInitial] = useState<string>(resolvedInitial);

  const jumpTo = (path: string) => {
    const trimmed = path.trim() || '/';
    setPendingInitial(trimmed);
    setBrowsePath(trimmed);
    setCoreKey((k) => k + 1);
  };

  const handleSelect = () => {
    if (!browsePath) return;
    setLastBrowsePath(sourceType, browsePath);
    onSelect(browsePath);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{i18n._(msg`library.folderPicker.title`)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                jumpTo(manualPath);
              }
            }}
            placeholder={i18n._(msg`library.folderPicker.pathPlaceholder`)}
            className="font-mono text-sm"
          />
          <FolderBrowserCore
            key={coreKey}
            sourceType={sourceType}
            getSourceConfig={getSourceConfig}
            initialPath={pendingInitial}
            autoLoad
            onBrowsePathChange={(p) => {
              setBrowsePath(p);
              setManualPath(p);
            }}
            height={340}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {i18n._(msg`library.folderPicker.cancel`)}
          </Button>
          <Button
            type="button"
            onClick={handleSelect}
            disabled={!browsePath}
          >
            {i18n._(msg`library.folderPicker.select`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Verify that `Input` and `Button` are already imported in `LibrariesPage.tsx`. If not, add them from `@/components/ui/input` and `@/components/ui/button`.

- [ ] **Step 4: Typecheck**

Run: `cd web && bun run typecheck`
Expected: passes. If `FolderBrowserCore` export/scope errors appear, ensure it's declared in the same module above its usage (both functions are top-level in this file — no export needed).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx
git commit -m "feat(libraries): add FolderPickerDialog component"
```

---

## Task 4: Wire folder-icon trigger into `LibraryForm` (edit mode + shared form)

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx:1474-1527` (the `form.Subscribe` block that currently holds the path field and inline `FolderBrowser`)

- [ ] **Step 1: Lift `pickerOpen` state to the top of `LibraryForm`**

Find the existing `useState` at the top of `LibraryForm` (line 959: `const [showAdvanced, setShowAdvanced] = useState(false);`). Add alongside it:

```tsx
const [pickerOpen, setPickerOpen] = useState(false);
```

State must live at the component top level — `useState` inside a `form.Subscribe` render callback is a rules-of-hooks violation.

- [ ] **Step 2: Replace the path section's inline browser with the icon trigger + dialog**

Locate the block in `LibraryForm` that starts with `{/* ── Path section with folder browser ── */}` (around line 1474). Replace the entire `form.Subscribe selector={(s) => s.values}` block + children with:

```tsx
<form.Subscribe selector={(s) => s.values}>
  {(values) => (
    <div className="space-y-3">
      <form.Field
        name="path"
        validators={{
          onChange: ({ value }) => (!value ? i18n._(msg`library.pathRequired`) : undefined),
        }}
      >
        {(field) => (
          <Field
            data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
          >
            <FieldLabel htmlFor="lib-path" className={labelClass}>
              {i18n._(msg`library.path`)}
            </FieldLabel>
            <div className="relative">
              <Input
                id="lib-path"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={fixedSourceType === 'local' ? '/mnt/media/anime' : '/Video/Anime'}
                className={cn('font-mono text-sm pr-10', inputClass)}
              />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                aria-label={i18n._(msg`library.browseFolder`)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={FolderOpenIcon} className="w-4 h-4" />
              </button>
            </div>
            <FieldError>
              {field.state.meta.isTouched && field.state.meta.errors[0]
                ? String(field.state.meta.errors[0])
                : null}
            </FieldError>
          </Field>
        )}
      </form.Field>

      <FolderPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        sourceType={fixedSourceType}
        getSourceConfig={() => buildSourceConfig(values) ?? {}}
        initialPath={values.path}
        onSelect={(p) => form.setFieldValue('path', p)}
      />

      {fixedSourceType !== 'local' && (
        <TestConnectionButton
          getConnectionInput={() => ({
            source_type: values.source_type,
            source_config: buildSourceConfig(values) ?? {},
            path: values.path,
          })}
        />
      )}
    </div>
  )}
</form.Subscribe>
```

The old inline `FolderBrowser` (previously under `{fixedSourceType !== 'local' && <FolderBrowser .../>}`) is **removed** — the dialog replaces it for all source types.

- [ ] **Step 3: Verify the inline `FolderBrowser` + its guard are removed**

Grep: `grep -n 'FolderBrowser' web/src/pages/LibrariesPage.tsx`
Expected: only occurrences remain at the component definitions (≈line 419 wrapper + new Core) and at line ~2263 (SMB discovery). The call near line 1508 should be gone.

- [ ] **Step 4: Typecheck**

Run: `cd web && bun run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx
git commit -m "feat(libraries): wire folder picker into LibraryForm path input"
```

---

## Task 5: Wire folder-icon trigger into `AddLibraryWizard` configure step + apply b2

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx:1881-1901` (source-type header — b2 change)
- Modify: `web/src/pages/LibrariesPage.tsx:2697-2758` (wizard path section + remove inline browser)

- [ ] **Step 1: Merge the back link into the source-type header row (b2)**

Locate the block starting at line 1881 (the `{/* Back link */}` comment) and ending at line 1901 (the end of the "Source label" div). Replace both blocks with a single row:

```tsx
{/* Source header: icon + label + change-source link, single row */}
<div className="flex items-center gap-2 mb-5">
  <div className="text-white/30">
    {allSourceCards.find((c) => c.key === sourceType)?.icon}
  </div>
  <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/40">
    {allSourceCards.find((c) => c.key === sourceType)?.name}
  </span>
  <button
    type="button"
    onClick={() => {
      setStep('source');
      setSmbStep('server');
    }}
    className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/40 hover:text-white/60 transition-colors cursor-pointer"
  >
    <span>&#8592;</span> {i18n._(msg`library.wizard.changeSource`)}
  </button>
</div>
```

- [ ] **Step 2: Add the picker state at the top of the `configure` branch**

Near the top of the configure step (after `setStep`/`setSmbStep` are in scope — anywhere above the path-section code), add:

```tsx
const [pickerOpen, setPickerOpen] = useState(false);
```

If the wizard already has other `useState` hooks at the top, put it alongside them. Do not place it inside a render callback.

- [ ] **Step 3: Replace the wizard path section's inline browser with icon trigger + dialog**

Locate the block starting at `{/* Path — with folder browser for non-local, non-SMB sources */}` around line 2697. Replace its `form.Subscribe` body so the inline `FolderBrowser` and the `{sourceType !== 'local' && ...}` guard around it are gone. Leave the `TestConnectionButton` intact (still guarded for `sourceType !== 'local'`):

```tsx
{sourceType !== 'smb' && (
  <form.Subscribe selector={(s) => s.values}>
    {(values) => (
      <div className="space-y-3">
        <form.Field
          name="path"
          validators={{
            onChange: ({ value }) =>
              !value ? i18n._(msg`library.pathRequired`) : undefined,
          }}
        >
          {(field) => (
            <Field
              data-invalid={
                field.state.meta.isTouched && field.state.meta.errors.length > 0
              }
            >
              <FieldLabel htmlFor="wiz-path" className={labelClass}>
                {i18n._(msg`library.path`)}
              </FieldLabel>
              <div className="relative">
                <Input
                  id="wiz-path"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={
                    sourceType === 'local' ? '/mnt/media/anime' : '/Video/Anime'
                  }
                  className={cn('font-mono text-sm pr-10', inputClass)}
                />
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-label={i18n._(msg`library.browseFolder`)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <HugeiconsIcon icon={FolderOpenIcon} className="w-4 h-4" />
                </button>
              </div>
              <FieldError>
                {field.state.meta.isTouched && field.state.meta.errors[0]
                  ? String(field.state.meta.errors[0])
                  : null}
              </FieldError>
            </Field>
          )}
        </form.Field>

        <FolderPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          sourceType={sourceType}
          getSourceConfig={() =>
            buildSourceConfig({ ...values, source_type: sourceType }) ?? {}
          }
          initialPath={values.path}
          onSelect={(p) => form.setFieldValue('path', p)}
        />

        {sourceType !== 'local' && (
          <TestConnectionButton
            getConnectionInput={() => ({
              source_type: sourceType,
              source_config:
                buildSourceConfig({ ...values, source_type: sourceType }) ?? {},
              path: values.path,
            })}
          />
        )}
      </div>
    )}
  </form.Subscribe>
)}
```

- [ ] **Step 4: Grep to confirm the SMB call site is still intact**

Run: `grep -n 'FolderBrowser' web/src/pages/LibrariesPage.tsx`
Expected: matches at the `function FolderBrowserCore`, `function FolderBrowser` definitions, and at the SMB discovery site (previously ~line 2263). **No** match where the wizard configure step or `LibraryForm` path section used to call it.

- [ ] **Step 5: Typecheck**

Run: `cd web && bun run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx
git commit -m "feat(libraries): unified folder picker in add-library wizard + b2 header"
```

---

## Task 6: Write Playwright E2E test

**Files:**
- Create: `web/e2e/library-folder-picker.spec.ts`

- [ ] **Step 1: Write the test**

Use the same API-mocking pattern seen in `web/e2e/test.spec.ts`. The test opens the add-library wizard, picks "Local", clicks the folder icon, navigates through the mocked directory tree, selects a folder, and asserts the path input receives the selected path.

```ts
import { expect, test } from '@playwright/test';

test('folder picker dialog: navigate and select on local source', async ({ page }) => {
  // Auth mocks
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ id: 'user-1', username: 'testuser' }),
    });
  });
  await page.route('**/api/v1/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ initialized: true }),
    });
  });

  // Libraries list: empty so the wizard opens
  await page.route('**/api/v1/libraries', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 201,
        body: JSON.stringify({
          id: 'lib-created',
          name: body.name,
          path: body.path,
          enabled: 1,
          source_type: body.source_type ?? 'local',
          scan_interval_minutes: body.scan_interval_minutes ?? 60,
        }),
      });
      return;
    }
    await route.fallback();
  });

  // Browse endpoint: simulated local filesystem
  //  /        -> ["mnt"]
  //  /mnt     -> ["media"]
  //  /mnt/media -> ["anime", "movies"]
  await page.route('**/api/v1/libraries/browse', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const tree: Record<string, string[]> = {
      '/': ['mnt'],
      '/mnt': ['media'],
      '/mnt/media': ['anime', 'movies'],
      '/mnt/media/anime': [],
    };
    const children = tree[body.path] ?? [];
    const directories = children.map((name) => ({
      name,
      path: (body.path === '/' ? '' : body.path) + '/' + name,
    }));
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ directories }),
    });
  });

  await page.goto('/libraries');

  // Open "Add library" — click the add card
  await page.getByRole('button', { name: /新增|add/i }).first().click();

  // Step 1: pick local source — the card labelled 本機 / Local
  await page.getByRole('button', { name: /本機|local/i }).first().click();

  // Step 2: configure — click the folder icon inside the path input
  await page.getByLabel(/瀏覽資料夾|Browse folder/i).click();

  // Dialog is open — navigate from / to /mnt/media/anime
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'mnt' }).click();
  await page.getByRole('button', { name: 'media' }).click();
  await page.getByRole('button', { name: 'anime' }).click();

  // Select this folder
  await page.getByRole('button', { name: /選擇此資料夾|Select this folder/i }).click();

  // Dialog closed, path input populated
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#wiz-path')).toHaveValue('/mnt/media/anime');
});
```

Note: the default locale in the app is `zh-TW` (`web/src/i18n/config.ts:33`), so the zh-TW strings are active in tests unless overridden. The locator regexes above already match the zh-TW and `en` forms. If `bun run test:e2e` runs in a different environment locale, use `page.evaluate(() => localStorage.setItem('language', 'zh-TW'))` before `page.goto('/libraries')` to pin the locale, or fall back to `page.getByRole('button')` with `data-testid` attributes if you prefer — the dialog already exposes `role=dialog` and the folder-icon button has `aria-label={msg`library.browseFolder`}` which becomes the translated string.

- [ ] **Step 2: Run the E2E test**

Run: `cd web && bun run test:e2e library-folder-picker.spec.ts`
Expected: the new test passes. If it fails, diagnose:
- **"button not found"** → inspect the actual rendered text via `await page.pause()` or a headed-mode screenshot
- **"dialog not visible"** → likely a portal root issue; confirm the dialog mounts into the document body
- **"path value mismatch"** → log the browsePath in the core and confirm the `onBrowsePathChange` wiring

- [ ] **Step 3: Commit**

```bash
git add web/e2e/library-folder-picker.spec.ts
git commit -m "test(e2e): folder picker dialog navigates and selects"
```

---

## Task 7: Full verification pass

**Files:** none new — validation only.

- [ ] **Step 1: Run full checks**

Run: `cd web && bun run check:all`
Expected: typecheck ✓, lint ✓, format ✓, tests ✓.

If lint fails, run `bun run lint:fix` and re-check. Do not bypass any check.

- [ ] **Step 2: Manual browser test — ask the user to start the dev server**

Per `web/AGENTS.md`: Claude does not start dev servers. Ask the user:
> "Please start `bun run dev` in `web/` and also `make dev` (or equivalent) for the API, then tell me to continue."

Once running, manually verify via screenshots or user confirmation:

1. Open `/libraries`, click "add library", pick **local** → step 2 shows the single-row source header (icon + 本機 + ← 改來源 on the right)
2. Click the folder icon inside the path input → modal opens
3. The dialog lists `/` root directories, breadcrumb shows `/`
4. Paste `/tmp` into the manual path input, press Enter → dialog jumps to `/tmp`
5. Navigate into a subfolder, press "Select this folder" → dialog closes, `path` input shows the selected absolute path
6. Close the wizard, reopen it → the manual path input inside the dialog should default to the previously-selected path (localStorage)
7. Repeat for **SMB** / **SFTP** (if credentials available) → same dialog works with remote
8. Open an **existing** library for edit → folder-icon trigger is visible, dialog works

Per `feedback_e2e_testing` memory: the feature must be fully E2E tested in the running app before marking complete.

- [ ] **Step 3: Request a code review**

Per `feedback_commit_after_verify`: invoke code review before finalizing. Use `superpowers:requesting-code-review` or dispatch an Agent with `subagent_type: feature-dev:code-reviewer` pointed at the diff against `main`. Address any high-priority findings by adding fix commits.

- [ ] **Step 4: Commit any review fixes**

If review surfaces changes: apply them, re-run `bun run check:all`, and commit as separate atomic commits (`fix(libraries): ...`). Do not squash onto earlier task commits.

---

## Task 8: Finish the branch

**Files:** none modified.

- [ ] **Step 1: Check diff for unintended changes**

Run: `git diff main --stat`
Expected: touched files are limited to:
- `web/src/pages/LibrariesPage.tsx`
- `web/src/locales/*/messages.po` and `messages.ts`
- `web/e2e/library-folder-picker.spec.ts`
- `docs/superpowers/specs/2026-04-17-library-form-folder-picker-design.md`
- `docs/superpowers/plans/2026-04-17-library-form-folder-picker.md`

If anything else appears (symlinks, `api/data/...`, `node_modules` noise), fix before continuing. Per `feedback_no_symlink_data`: check for unexpected symlinks in the diff.

- [ ] **Step 2: Invoke finishing-a-development-branch skill**

Use `superpowers:finishing-a-development-branch` to decide how to merge or stack. Do **not** merge autonomously — present options to the user.

---

## Success Criteria

All conditions from the spec §Success Criteria must hold:

1. User can add a local library without typing a path
2. Same modal works uniformly for local + all remote source types with no regression
3. Paste-and-Enter inside the modal jumps to the pasted path
4. Last-browsed path per source type is remembered across form sessions
5. Wizard source-type header is a single row
6. `bun run check:all` passes; `bun run test:e2e library-folder-picker.spec.ts` passes; manual browser verification confirmed
