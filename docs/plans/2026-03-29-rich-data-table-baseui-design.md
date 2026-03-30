# Design Doc: Rich Data Table with Base UI and Framer Motion

## Overview
Refactor, optimize, and enhance the data table and pagination UI/UX in the Libraries Detail page using Base UI for interactive primitives and Framer Motion for high-fidelity animations.

## Goals
- **UX**: Smooth transitions between pages and filter states.
- **UI**: Modern, polished "Neko Pulse" aesthetic with interactive "haptics" (scale/slide).
- **Architecture**: Decouple bulky table/pagination logic into reusable `MotionTable` and `MotionPagination` components.
- **Consistency**: Use Base UI for all interactive elements (buttons, inputs, selects).

## Components

### 1. `MotionTable`
A wrapper for `@tanstack/react-table` that adds staggered row entrance animations.
- **Animation**: `motion.tr` with `initial={{ opacity: 0, y: 10 }}` and `animate={{ opacity: 1, y: 0 }}`.
- **Stagger**: `staggerChildren: 0.05` for a "waterfall" effect when switching pages.
- **Exit**: `AnimatePresence` with `mode="popLayout"` to prevent layout jumping.

### 2. `MotionPagination`
A completely redesigned pagination footer using Base UI.
- **Active State**: A sliding background "bubble" using Framer Motion `layoutId` that moves between page numbers.
- **Interactive Primitives**:
  - `Base UI Button` for "Next/Previous" and page numbers.
  - `Base UI Select` for "Items per page".
  - `Base UI NumberField` or `Input` for "Jump to page".
- **Visuals**: Glassmorphism (`backdrop-blur`), subtle scale transitions on press (`whileTap={{ scale: 0.95 }}`).

## Refactoring Strategy
- **`LibraryDetailPage.tsx`**: Extract `FileTable` and `Pagination` logic.
- **Data Hook**: Use a simplified TanStack Query + Table hook that manages state and provides the `table` instance to the UI components.
- **Empty/Loading States**: Standardize skeletons to match the new `MotionTable` layout precisely.

## Dependencies
- `@base-ui-components/react`: For accessible primitives.
- `motion/react` (Framer Motion): For the animation layer.
- `@tanstack/react-table`: For table logic.

## Success Criteria
- [ ] No "layout jumping" when switching pages.
- [ ] Fluid, staggered row entrance animations.
- [ ] Interactive "active bubble" sliding between page numbers.
- [ ] Full keyboard accessibility (Base UI).
