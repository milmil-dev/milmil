# Library Form — Folder Picker & Layout Polish

**Date:** 2026-04-17
**Surface:** `新增媒體庫` (Add Library) configure step (`AddLibraryWizard` at `LibrariesPage.tsx:1622`) and the shared `LibraryForm` (line 946) used for edit mode.
**Scope:** one spec → one implementation plan

## Problem

Adding a **local** library requires manually typing a server path (e.g., `/mnt/media/anime`) into a free-text input. Remote sources (SMB, SFTP, WebDAV…) already have an inline folder browser, but local does not. The form also has two smaller layout issues: the source-type header is stacked across two rows wasting vertical space, and the path input has no discoverable affordance for browsing.

Users don't know what paths exist on the server, so they guess, submit, and get "path does not exist" errors.

## Constraints

- **Server-side path.** milmil is a server media app. The path refers to the server's filesystem, not the client's. Browser-level pickers (`<input type=file>`, `showDirectoryPicker()`) return client paths and are useless here.
- **Backend is already sufficient.** `POST /api/v1/libraries/browse` supports `source_type: "local"` via `storage.NewProvider("local", …)`. No backend changes required.
- **Existing component.** `FolderBrowser` (`web/src/pages/LibrariesPage.tsx:419`) already implements the inline browsing UX for remote sources. Its internals are reusable.
- **Stack conventions.** React 19 + TanStack Form + Lingui + shadcn dialogs + Tailwind v4. Follow `web/AGENTS.md`.

## Design

### 1. Unified `FolderPickerDialog`

Replace the inline `FolderBrowser` (currently shown only for non-local sources) with a modal dialog that works uniformly for **all** source types.

**Component structure:**

```
FolderPickerDialog
├── DialogHeader  — title: "選擇資料夾"
├── Body
│   ├── Manual path input (paste-and-Enter jump)
│   ├── Breadcrumb row  (click any crumb to navigate up)
│   └── Directory listing (fixed ~340px height, scrolls)
└── DialogFooter
    ├── Cancel button
    └── Select-this-folder button (disabled until a successful browse)
```

**Props:**

| Prop | Type | Purpose |
|---|---|---|
| `open` | `boolean` | Controlled open state |
| `onOpenChange` | `(open: boolean) => void` | Close / dismiss |
| `sourceType` | `SourceType` | Forwarded to `/browse` |
| `getSourceConfig` | `() => Record<string, unknown>` | Forwarded to `/browse`; returns `{}` for local |
| `initialPath` | `string` | Starting path (defaults to remembered path or `/`) |
| `onSelect` | `(path: string) => void` | Called with the chosen absolute path |

**Starting path resolution (in order):**

1. `initialPath` if non-empty
2. `localStorage[`milmil.lastBrowsePath.${sourceType}`]` if present
3. `/`

On successful select, write the chosen path back to the same localStorage key.

**Internal implementation:** extract the navigation state + listing render from the existing `FolderBrowser` into a shared `FolderBrowserCore` sub-component (same state: `browsePath`, `directories`, `isShareLevel`, `selectedShare`, `browseMutation`). `FolderPickerDialog` renders `FolderBrowserCore` inside a `Dialog`. `FolderBrowser` is refactored into a thin inline wrapper over `FolderBrowserCore` so the one remaining inline caller (SMB share discovery — see §2) continues to work unchanged.

**Manual path input:** single `Input` above the breadcrumb. On `Enter`, calls `doBrowse(trimmedValue)`. If the server rejects it, show an inline error under the input. Does not auto-fire on every keystroke.

**Select button state:**

- Disabled while `browseMutation.isPending`
- Disabled if `browsePath === ''`
- Otherwise enabled — selecting calls `onSelect(browsePath)`, persists to localStorage, closes the dialog

### 2. Call sites converted / left alone

`FolderBrowser` is referenced in three places in `LibrariesPage.tsx` today:

| Line | Context | Action |
|---|---|---|
| ~1508 | `LibraryForm` path section (edit-library dialog, and also rendered from the wizard's non-SMB configure step) | **Convert to dialog trigger.** Remove the `fixedSourceType !== 'local'` guard so the trigger appears for all types. |
| ~2738 | `AddLibraryWizard` configure step — the form shown in the screenshot | **Convert to dialog trigger.** Remove the `sourceType !== 'local'` guard. |
| ~2263 | `AddLibraryWizard` SMB-specific configuration step, `autoLoad` share discovery | **Leave inline.** This is a discovery surface (find shares on a host), not a path picker. Out of scope. |

The `FolderBrowser` component therefore **stays** in the codebase to serve the SMB discovery step. It gets refactored internally: its body is extracted into `FolderBrowserCore`, and `FolderBrowser` becomes a thin wrapper that renders `FolderBrowserCore` inline (preserving `autoLoad` + `onShareSelect` behavior for site #3). `FolderPickerDialog` renders the same `FolderBrowserCore` inside a `Dialog`.

The `TestConnectionButton` remains visible only for non-local sources (local has no connection to test; path validity is checked server-side on submit).

### 3. Source-type header (b2) — wizard configure step only

Applies to `AddLibraryWizard` step 2 (lines ~1882–1901). Currently:

```tsx
<button onClick={…}>← 改來源</button>         // line 1882-1891, block, mb-4
<div className="flex items-center gap-2 mb-5">  // line 1894-1901
  [icon]  本機
</div>
```

Replace with a single row:

```tsx
<div className="flex items-center gap-2 mb-5">
  [icon]  本機
  <button onClick={…} className="ml-auto …">← 改來源</button>
</div>
```

The back button keeps its existing small uppercase treatment and click handler (`setStep('source'); setSmbStep('server')`). Vertical space saved: ~36px on the configure step.

The edit-mode `LibraryForm` (line 946) does **not** get this change — there's no back button there (source type is fixed once a library exists).

### 4. Path input + browse trigger (a1) — two call sites

Applies to both path inputs:

- `LibraryForm` at `LibrariesPage.tsx:1491-1497` (edit mode and shared form)
- `AddLibraryWizard` configure step at `LibrariesPage.tsx:2718-2726` (id `wiz-path`)

Replace the bare `Input` with a wrapper:

```tsx
<div className="relative">
  <Input
    id="lib-path"
    value={field.state.value}
    onChange={…}
    placeholder={fixedSourceType === 'local' ? '/mnt/media/anime' : '/Video/Anime'}
    className={cn('font-mono text-sm pr-10', inputClass)}
  />
  <button
    type="button"
    onClick={() => setPickerOpen(true)}
    aria-label={i18n._(msg`library.browseFolder`)}
    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
  >
    <HugeiconsIcon icon={FolderOpenIcon} className="w-4 h-4" />
  </button>
</div>
<FolderPickerDialog
  open={pickerOpen}
  onOpenChange={setPickerOpen}
  sourceType={fixedSourceType}
  getSourceConfig={() => buildSourceConfig(values) ?? {}}
  initialPath={values.path}
  onSelect={(p) => form.setFieldValue('path', p)}
/>
```

Icon choice: `FolderOpenIcon` from `@hugeicons/core-free-icons`, rendered via `HugeiconsIcon` from `@hugeicons/react` (already used elsewhere in `web/src`, e.g., `LibraryDetailPage.tsx`, `NotificationBell.tsx`). `setPickerOpen` is a local `useState<boolean>` inside the form (or colocated in a small subcomponent if it simplifies rendering).

Tooltip: not required — `aria-label` is sufficient for the small overlay button; a tooltip would visually conflict with the input focus ring.

### 5. i18n keys to add

| Key | en | zh-TW |
|---|---|---|
| `library.browseFolder` | Browse folder | 瀏覽資料夾 |
| `library.folderPicker.title` | Select folder | 選擇資料夾 |
| `library.folderPicker.pathPlaceholder` | Paste a path and press Enter | 輸入路徑後按 Enter |
| `library.folderPicker.select` | Select this folder | 選擇此資料夾 |
| `library.folderPicker.cancel` | Cancel | 取消 |
| `library.folderPicker.invalidPath` | Path not found | 找不到路徑 |

Locale set to update: `en`, `ja`, `ko`, `zh-CN`, `zh-HK`, `zh-TW` (all directories under `web/src/locales/`). `zh-HK` can mirror `zh-TW`. Follow standard flow: edit `.po` → `bun run i18n:compile`.

### 6. Removed code

- Inline `FolderBrowser` calls at `LibrariesPage.tsx:~1508` and `~2738` — replaced by `FolderPickerDialog` triggered from the path input
- Both `fixedSourceType !== 'local'` / `sourceType !== 'local'` guards wrapping those two calls
- `FolderBrowser` itself is **not** removed — it's kept as a thin wrapper over `FolderBrowserCore` for the SMB discovery step at line ~2263

## Files Touched

- `web/src/pages/LibrariesPage.tsx`
  - Extract `FolderBrowserCore` from the existing `FolderBrowser` body
  - Refactor `FolderBrowser` into a thin inline wrapper over `FolderBrowserCore` (preserves SMB share discovery at line ~2263)
  - Add `FolderPickerDialog` component (new) — renders `FolderBrowserCore` inside a `Dialog`, adds manual path input + localStorage persistence
  - Replace inline `FolderBrowser` with the dialog + folder-icon trigger at:
    - `LibraryForm` path section (~1491–1514) — applies a1
    - `AddLibraryWizard` configure step (~2718–2746) — applies a1 + b2
  - Source-type header single-row merge in `AddLibraryWizard` step 2 (~1882–1901) — applies b2
- `web/src/locales/{en,zh-TW,zh-HK,zh-CN,ja,ko}/messages.po` — add keys from §5
- `web/src/locales/*/messages.ts` — regenerated by `bun run i18n:compile`

No backend changes. No new API endpoints. No DB migration.

## Testing

- **E2E (Playwright):** new test case in an existing `libraries.spec.ts` (or create one if absent): open Add Library → local → click folder icon → navigate `/ → tmp → <created test dir>` → Select → assert path input value → Submit → library appears in list. Use a tmp dir created in test setup so the server path actually exists.
- **Per the user's `feedback_e2e_testing`:** full E2E run in the running app before marking complete.
- **Unit tests:** none required; the new component is thin glue over `FolderBrowserCore` which retains its existing behavior.

## Out of Scope (explicit YAGNI list)

These were considered and deferred:

- "New folder…" button inside the modal (adds a mutation endpoint)
- Quick-shortcuts sidebar (`$HOME`, `/mnt`, …) — hard-codes filesystem assumptions
- Type-to-filter the current listing
- Folder metadata (size / item count) — expensive `stat` calls on remote sources
- Test-connection affordance for local sources — low value since submit already validates path existence
- Any change to the source-picker step of the wizard
- Changes to the Advanced / scan-interval section

## Success Criteria

1. User can add a local library without typing a path — folder-icon click, navigate, select, submit.
2. Same modal works for SMB / SFTP / WebDAV / S3 / FTP / HTTP / Rclone with no regression vs the current inline browser.
3. Paste-and-Enter jumps straight to the pasted path inside the modal.
4. Last-browsed path per source type is remembered across form sessions.
5. Source-type header occupies a single row.
6. E2E passes in `bun run test:e2e`; `bun run check:all` passes.
