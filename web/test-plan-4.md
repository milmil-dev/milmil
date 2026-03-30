Okay, the fix is exactly in `web/src/components/MotionTable.tsx`:
Change `<AnimatePresence mode="popLayout" initial={false}>` to `<AnimatePresence mode="popLayout">`.

What about point 3? "Check the "Empty state" rendering logic around line 279 in LibraryDetailPage.tsx. Does it accidentally trigger when isLoading is false but data is just momentarily empty, or is debouncedSearch affecting it?"

Let's look at `debouncedSearch`:
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
The `useEffect` queues a timeout. 300ms later, `setDebouncedSearch("")` and `setPage(1)` are called.
If `search` is changed to `"foo"`, `debouncedSearch` is still `""`.
The query fetches with `q: undefined`.
`files.length` might be 0.
Then 300ms later, `debouncedSearch` becomes `"foo"`.
The query fetches with `q: "foo"`.
During this time, `isLoading` might be `false` (because we already fetched for `""`?), but `isFetching` becomes true.
Wait, if `debouncedSearch` is `"foo"`, `files.length === 0` and `isLoading === false`, it renders:
```typescript
      {!isLoading && files.length === 0 && debouncedSearch && (
        <div className="py-12 text-center">
          <p className="text-[13px] text-mm-text-muted">{i18n._(msg`library.detail.noFiles`)}</p>
        </div>
      )}
```
But what about the main Empty State?
```typescript
  if (!isLoading && files.length === 0 && !debouncedSearch) {
    // Empty state
```
If `debouncedSearch` is `""`, and there are truly NO files, it returns the big Empty State!

Wait, what if the backend returns NO files, but the user hasn't typed anything? It SHOULD show the empty state!
The only bug happens when you enter the page and `debouncedSearch` hasn't updated yet?
No, it starts as `""`.
What if you type `"f"`?
`search` is `"f"`. `debouncedSearch` is STILL `""`.
So it returns the Big Empty State if `files.length` is 0?
But wait, if you type `"f"`, `files.length` is what it was for `""`. If there are files for `""`, it won't show the Empty State. If there are NO files for `""`, it shows the Big Empty State.
So this logic is perfectly correct!
Unless there's a split second where `isLoading` becomes false but `files` is `[]` before `debouncedSearch` updates?
No, `isLoading` is tied to the query key.

Could the problem be `isLoading`?
In TanStack Query v5, `isLoading` is true ONLY when there's NO cached data.
If you visit the page, data loads. You navigate away. You come back.
`isLoading` is FALSE instantly (because data is cached).
`files.length` > 0.
`MotionTable` mounts.
`AnimatePresence` mounts.
Because `initial={false}`, the rows skip animation.
And because they skip animation inside a `layout` group or because of a bug in Framer Motion with `initial={false}` inside a parent `AnimatePresence`, they don't render or get stuck at `opacity: 0`.

I will report exactly this:
1. `initial={false}` on `AnimatePresence` in `MotionTable` causes the rows to be stuck hidden (or completely missing their entrance) when the table mounts with existing data (e.g., from cache on first entry or tab switch), because it disables the initial animation, which conflicts with `motion.tr` layout and the parent's `AnimatePresence`. Changing it to `<AnimatePresence mode="popLayout">` ensures rows correctly animate in on initial render.
2. The empty state logic `!isLoading && files.length === 0 && !debouncedSearch` is generally correct, but it might flash or unmount the table entirely if `files` is empty, which resets `MotionTable` state. However, the true root cause for "no data display" when data actually exists is `initial={false}` skipping the required entrance animation for the populated table rows.

Wait, is there anything else in `debouncedSearch`?
If you type "a", `search="a"`, `debouncedSearch=""`.
The list shows all files.
300ms later, `debouncedSearch` becomes `"a"`.
The query key changes to `['libraryFiles', id, 'all', 'a', 1, 20]`.
For this new query, is `isLoading` true?
YES! `isLoading` is true for NEW query keys that have no cache!
So the whole table DISAPPEARS and says "Loading..." for 100ms!
Then it returns.
This is because `keepPreviousData` (now `placeholderData: keepPreviousData` in v5) is MISSING!
So `isLoading` goes `true` on EVERY keystroke that changes the search term!
AND when `isLoading` goes `true`, the `MotionTable` is STILL rendered because it's only unmounted in the Empty State!
```typescript
      {/* Table */}
      <MotionTable table={table} />

      {isLoading && (
        <div className="py-6 text-center">
...
```
Wait, if `isLoading` is true on search, `files` becomes `undefined` -> `[]`.
So `MotionTable` renders with 0 rows!
Then data comes back, `MotionTable` gets the rows. They animate in.
But because `initial={false}` is on `AnimatePresence`, and `AnimatePresence` NEVER unmounted, the NEW rows are considered ENTERING, so they DO animate!

So `initial={false}` ONLY affects the very first render of `MotionTable`.
If it mounts with `data` ALREADY populated, they skip animation.
If they skip animation and it fails to display, THAT is the "first entry" bug!
Why does it fail to display if it skips animation?
Because `initial={{ opacity: 0, y: 10 }}` and `animate={{ opacity: 1, y: 0 }}`.
If `initial={false}`, they start at `opacity: 1, y: 0`.
BUT the parent `LibraryDetailPage` has:
```typescript
          <AnimatePresence mode="wait">
            {activeTab === 'files' && (
              <motion.div
                key="files"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
...
```
When `activeTab` becomes `'files'`, the `motion.div` animates `opacity` from 0 to 1.
If `MotionTable` inside it has `initial={false}`, the `AnimatePresence` inside also propagates `initial={false}`.
Framer Motion's `initial={false}` on a child `AnimatePresence` CAN cause the children to stay at `opacity: 0` or glitch because the context is overriden.
Yes! The root cause is `initial={false}` on `AnimatePresence` in `MotionTable.tsx`.
