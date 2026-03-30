1. Issue: "no data display on first entry" in `LibraryDetailPage` -> `MotionTable`.
2. `LibraryDetailPage` fetches data using `useQuery` via `libraryApi.mediaFiles(libraryId, ...)`.
3. `const files = data?.items || [];`
4. On first entry:
   - `isLoading` is `true`, `files.length` is 0.
   - The `<MotionTable table={table} />` renders with 0 rows.
   - We show `isLoading && <div className="py-6 text-center">...Loading...</div>`.
5. When fetch completes:
   - `isLoading` becomes `false`.
   - `files.length` is > 0 (assuming data exists).
   - `MotionTable` rerenders with `table.getRowModel().rows` having > 0 rows.
6. `MotionTable` uses `<AnimatePresence mode="popLayout" initial={false}>`
   - `initial={false}` means that components present when `AnimatePresence` **mounts** will not play their initial animation (they will just snap to their `animate` state).
   - Wait, if `AnimatePresence` mounts with `0` rows (when `isLoading` is true), and THEN rows are added, they are treated as **entering** components!
   - So `initial={false}` only affects the `0` rows present at mount. The newly added rows WILL play their entrance animation.
7. BUT what if `AnimatePresence` entrance animation is bugged or too slow?
   - `delay: index * 0.04` is used. If there are 20 rows, the last one is delayed by `0.8s`. This is perfectly fine.
8. Is `files` array empty for a split second when `isLoading` is false?
   - If `keepPreviousData` isn't used, changing query keys (like `debouncedSearch`) might cause `isLoading` to go `true` again, but here the issue is "first entry".
9. Let's look at the "Empty state" rendering logic around line 280:
   ```typescript
   if (!isLoading && files.length === 0 && !debouncedSearch) {
     return (
       <div className="py-20 flex flex-col items-center text-center">
         ... "No files" ...
       </div>
     );
   }
   ```
   If this triggers, the whole table is unmounted!
   Wait, if `data` is returned as empty from the backend, then it's correct to show the empty state.
   Why would there be "no data display on first entry"?
   If there is ACTUAL data, why isn't it displaying?
   Could it be that the table is rendering the rows but they are not visible?
   Let's check `initial={{ opacity: 0, y: 10 }}`. If `AnimatePresence` mounts when `files` is already populated, `initial={false}` means they will skip `initial` and snap to `animate={{ opacity: 1, y: 0 }}`.
   BUT wait! If `initial={false}` is on `AnimatePresence`, the children that are present when it mounts will have their `initial` state skipped.
   Wait, `motion/react` v12 behavior for `initial={false}`: it disables the initial animation for the **entire tree** on initial render.
   Is there a bug in `framer-motion` (or `motion/react`) where `initial={false}` combined with layout animations or `mode="popLayout"` causes elements to be stuck at `opacity: 0`?
