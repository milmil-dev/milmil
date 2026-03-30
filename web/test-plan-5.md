To verify:
Let's see the empty state logic in `web/src/pages/LibraryDetailPage.tsx`:
```tsx
  if (!isLoading && files.length === 0 && !debouncedSearch) {
    // Empty state
```
If `isLoading` is false, and `files.length` is 0, AND `debouncedSearch` is `""`.
This triggers the "No Files" SVG and text.
BUT what if we enter the page, and `debouncedSearch` is `""`, and `files` is `[]`, and `isLoading` is true?
`isLoading` is true, so `!isLoading` is false.
It does NOT trigger the Empty state.
Instead, it renders `<MotionTable table={table} />` and `{isLoading && <div className="py-6 text-center">...Loading...</div>}`.
So the first 100ms it shows an empty table and "Loading...".
Then data arrives, `isLoading` becomes false, `files` has length 20.
`MotionTable` updates with 20 rows.
Since `<AnimatePresence>` was ALREADY MOUNTED with 0 rows, the 20 new rows are ENTERING components.
Wait! If they are ENTERING components, `initial={false}` on `AnimatePresence` DOES NOT AFFECT THEM!
They will animate from `opacity: 0, y: 10` to `opacity: 1, y: 0`.
So they SHOULD SHOW UP just fine!

Then why is there "no data display on first entry"?
What if the query is FAST (cached)?
If you navigate away and come back, the query is cached.
`isLoading` is FALSE on the FIRST RENDER.
`files` is `20`.
`MotionTable` renders with 20 rows on its FIRST MOUNT.
Because it's the FIRST MOUNT of `AnimatePresence`, the `initial={false}` prop APPLIES to the 20 rows.
They skip their `initial` state (`opacity: 0, y: 10`) and start at `animate` (`opacity: 1, y: 0`).
If this skip is buggy in `framer-motion` (especially with `mode="popLayout"` on `<motion.tr>`), they might not appear or get stuck at `opacity: 0`.
YES! That's exactly it! The cached fast-load triggers the `initial={false}` behavior, which bugs out.
Wait, the prompt says "no data display on first entry".
First entry usually means NOT cached.
If not cached, maybe `isLoading` is FALSE?
No, in `useQuery`, if it's the first fetch, `isLoading` is TRUE.

Wait, check the query hook:
```tsx
  const { data, isLoading } = useQuery({
    queryKey: libraryKeys.mediaFiles(libraryId, {
      status: statusFilter,
      q: debouncedSearch || undefined,
      page,
      per_page: perPage,
    }),
    queryFn: () =>
      libraryApi.mediaFiles(libraryId, { ... }),
  });
```
Is there a case where `isLoading` is false but data is empty?
Yes, if the backend returns `items: []`. Then the empty state triggers.
Is there a case where `debouncedSearch` is `""`, data is `[]` momentarily, and `isLoading` is false?
If `debouncedSearch` changes from `"foo"` to `""`. The query key changes. `isLoading` becomes TRUE (because there's no cache for `""` yet).
If there IS cache for `""`, `isLoading` is FALSE, and it shows the old data instantly.

So the bug must be `initial={false}` on `MotionTable` preventing the rows from displaying when they mount with the component (e.g., when data is cached or available instantly).

I have everything I need to write the report.
