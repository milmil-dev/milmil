Wait! I figured it out.
Look at `LibraryDetailPage.tsx`:

```typescript
  if (!isLoading && files.length === 0 && !debouncedSearch) {
    // Empty state
    if (statusFilter === 'unmatched') {
      return (
        <div className="py-16 text-center">
          <span className="text-green-400 text-2xl mb-2 block">&#10003;</span>
          <p className="text-[13px] text-green-400/70">{i18n._(msg`library.detail.allMatched`)}</p>
        </div>
      );
    }
    return (
      <div className="py-20 flex flex-col items-center text-center">
...
```

BUT wait, there's another empty state rendering logic!
```typescript
      {!isLoading && files.length === 0 && debouncedSearch && (
        <div className="py-12 text-center">
          <p className="text-[13px] text-mm-text-muted">{i18n._(msg`library.detail.noFiles`)}</p>
        </div>
      )}
```
No, that's just a message under the table.

What happens if `files` are loaded but `debouncedSearch` is NOT set?
If `isLoading` is FALSE, and `files.length` > 0.
Then `!isLoading && files.length === 0` is FALSE. It proceeds.

So when does the bug "no data display on first entry" happen?
Is it because `isLoading` is initially FALSE before the query starts?
No, `useQuery` starts immediately, `isLoading` is `true`.
Wait! In TanStack Query v5, if `placeholderData` is NOT used, `isLoading` (meaning `status === 'pending' && fetchStatus === 'fetching'`) is true on first fetch.
But if there IS data in the cache from a previous visit? Then `isLoading` is false.
Wait, on "first entry" to `LibraryDetailPage`, it fetches `libraryApi.mediaFiles(...)`.

Could `debouncedSearch` be the problem?
```typescript
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
```
Initially, `search` is `""`. `debouncedSearch` is `""`.
Then, `useEffect` sets a timeout.
After 300ms, it calls `setDebouncedSearch('')` and `setPage(1)`.
Wait, calling `setPage(1)` does NOT change the state if it's already 1.
BUT what if it does? It triggers a re-render.
Wait! What if `initial={false}` on `MotionTable` is causing the bug?

In `MotionTable`:
```typescript
        <AnimatePresence mode="popLayout" initial={false}>
          {table.getRowModel().rows.map((row, index) => (
            <motion.tr
              key={row.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{
                duration: 0.3,
                delay: index * 0.04,
                ease: [0.23, 1, 0.32, 1], // easeOutQuint
                layout: { duration: 0.2 },
              }}
```

When `initial={false}` is on `<AnimatePresence>`, it tells Framer Motion NOT to animate components that are present **when `AnimatePresence` first mounts**.
On first entry:
1. `isLoading` is true, `files.length` is 0.
2. `MotionTable` is rendered! (it's outside of `if (!isLoading && files.length === 0)` block)
3. `<AnimatePresence>` mounts with 0 children.
4. Then the fetch completes! `files` becomes populated.
5. `<AnimatePresence>` receives NEW children (`motion.tr`).
6. Because these children were NOT present on the *initial* mount of `AnimatePresence`, `initial={false}` does NOT apply to them!
7. They SHOULD animate from `opacity: 0` to `opacity: 1`.

Is this what is failing?
Wait! Look at `LibraryDetailPage.tsx`:
```typescript
  if (!isLoading && files.length === 0 && !debouncedSearch) {
    // Empty state
    ...
    return (
       ... empty state UI ...
    );
  }

  return (
    <div>
      ...
      {/* Table */}
      <MotionTable table={table} />
      ...
  )
```

Suppose `files` are fetched VERY QUICKLY (e.g., from cache or very fast network).
1. `isLoading` is true, `files.length` is 0.
2. `MotionTable` is rendered (empty).
3. Data arrives! `isLoading` becomes false, `files.length` > 0.
4. The children are added to `MotionTable`. They animate.

BUT what if the data is fetched BEFORE the 300ms `debouncedSearch` timeout fires?
Actually, the timeout just sets `debouncedSearch` to `""`, which is what it ALREADY was. It causes NO re-render.

Wait! Could it be that `layout` property on `motion.tr` combined with `mode="popLayout"` breaks the initial entrance animation for `<tr>` elements?
Yes! `mode="popLayout"` forces `AnimatePresence` to take the element out of the document flow (using `position: absolute` or similar) when it exits, and calculates layout. But for a `<tr>`, `position: absolute` completely breaks the table layout!
AND if it's broken, it might measure its height as 0, or place it wrongly, OR the browser might refuse to render it because a `<tr>` cannot be absolutely positioned inside a `<tbody>` without breaking table semantics, which leads to unpredictable rendering behavior (often invisible or zero-width).

Wait, the bug report says: "Check if `initial={false}` on `AnimatePresence` in `MotionTable` is preventing initial rendering."
If `initial={false}` on `AnimatePresence` is the issue, it means if `AnimatePresence` mounts WITH the children (e.g. if the data is already in cache so `isLoading` is false immediately), then `initial={false}` APPLIES to the rows!
If it applies to the rows, they should start at `animate` values (`opacity: 1, y: 0`). So they SHOULD be visible immediately!
Wait... what if `motion/react` has a bug where `initial={false}` on `AnimatePresence` WITH `layout` prop on children causes them to be stuck at `opacity: 0`?
Let's remove `initial={false}`!
If we change it to `initial={true}` or just remove it, does it fix it?

Let's check `LibraryDetailPage.tsx` empty state again.
Wait! What if data is fetched FAST, but because of `initial={false}`, the rows never appear?
No, the prompt explicitly asks: "Check if `initial={false}` on `AnimatePresence` in `MotionTable` is preventing initial rendering."

Let's do EXACTLY what the prompt says:
1. Trace data flow: `useQuery` -> `files` -> `useReactTable` -> `MotionTable`. If `useQuery` returns data instantly (e.g., from cache), `files` has data on FIRST render.
2. If `files` has data on first render, `MotionTable` mounts WITH children.
3. Because `AnimatePresence` mounts WITH children AND `initial={false}` is set, the children skip their `initial` animation.
4. BUT there's a known behavior in Framer Motion where `layout` animations on initial mount with `initial={false}` can sometimes cause elements to not render correctly or stay hidden until a layout change triggers an update, or `mode="popLayout"` interacts badly with `initial={false}`.
Actually, if `initial={false}`, the initial state is supposed to be the `animate` state.
Is it possible that `initial={false}` is disabling the initial animation, but they are rendered with `opacity: 0` because of the `initial={{ opacity: 0 }}` prop on the child?
No, `initial={false}` OVERRIDES the child's `initial` prop.

Let's check the empty state logic:
```typescript
  if (!isLoading && files.length === 0 && !debouncedSearch) {
    // Empty state
    ...
```
If `debouncedSearch` is `""`, `isLoading` is false, and `files.length` is 0, it returns the Empty State.
What if `files.length` is 0 but it's STILL loading?
Then `isLoading` is true, so it does NOT return the Empty state. It returns the main page with `<MotionTable />` and `isLoading && <div className="py-6 text-center">...Loading...</div>`.
Wait, in TanStack Query, `isLoading` is true when there is NO cached data AND it's currently fetching.
If you navigate to the page, `isLoading` is true. The table renders empty.
Then data arrives, `isLoading` becomes false, `files.length` > 0. The table renders with rows. The rows are NEW children, so they animate in. This works fine!

BUT what if you navigate AWAY from the page and come BACK?
Then data is in cache!
`isLoading` is FALSE. `files.length` > 0.
The page renders. `MotionTable` mounts WITH children.
`AnimatePresence` mounts with `initial={false}`.
The children mount with `initial={false}`.
If `initial={false}` causes a bug where the rows don't display on "first entry" (or re-entry), then that's the issue!

Let me read the exact wording of the prompt: "Check if initial={false} on AnimatePresence in MotionTable is preventing initial rendering."
This strongly implies that removing `initial={false}` (or changing it to `initial={true}`) from `<AnimatePresence mode="popLayout" initial={false}>` in `MotionTable` is the fix.

Why would `initial={false}` prevent initial rendering?
Because `MotionTable` is often unmounted and remounted (e.g. when switching tabs? No, the tabs are handled by `AnimatePresence mode="wait"`).
Wait, look at the Tabs!
```typescript
          <AnimatePresence mode="wait">
            {activeTab === 'files' && (
              <motion.div
                key="files"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <FileTable libraryId={id} onMatch={setMatchingFile} />
              </motion.div>
            )}
```
When `activeTab` is `'files'`, `FileTable` mounts.
`FileTable` renders `MotionTable`.
`MotionTable` mounts `<AnimatePresence mode="popLayout" initial={false}>`.

If `FileTable` mounts, the query runs. If data is cached, it's there instantly.
`MotionTable` renders with rows. `AnimatePresence` `initial={false}` skips animation.
Does it fail to render? Yes, in `framer-motion`, there's a known bug where nested `AnimatePresence` (or `initial={false}` on a component whose parent is animating in) can result in the children being stuck at `opacity: 0` because they don't get the correct initialization when the parent overrides their context, OR because of `<motion.tr layout>` not measuring correctly when skipped.
Actually, if the parent (`motion.div` key="files") has `initial={{ opacity: 0 }}` and `animate={{ opacity: 1 }}`, and the child `AnimatePresence` has `initial={false}`, the `AnimatePresence`'s children inherit `initial={false}`. This can conflict with the parent's variant propagation or cause them to skip their layout calculation correctly!
To fix it, just remove `initial={false}` from `MotionTable`! Or change it to `initial={true}` so they animate in.

Let me grep for `useReactTable` to ensure I'm fixing the right component.
