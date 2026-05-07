# AI Agent Instructions

## Overview

milmil web frontend — the React SPA that talks to the milmil Go API. Built with React 19, TanStack Router, Tailwind CSS v4, and Serwist PWA. Ships as a static bundle served by nginx in production (see `web/nginx.conf`); the API runs in a separate container at `/api/*`.

## Core Rules

### Development Practices

1. **Use bun only**: `bun install`, `bun run`, `bunx`
2. **Read Before Editing**: Always read files first to understand context
3. **Follow Established Patterns**: Match existing code style and architecture
4. **Quality Gates**: Run `bun run check:all` after significant changes
5. **No Dev Server**: Ask user to run and report back
6. **No Unsolicited Commits**: Only commit when explicitly requested

## Tech Stack

| Category | Library |
|---|---|
| Runtime | Bun |
| UI Framework | React 19 + React Compiler |
| Routing | TanStack Router (code-based, type-safe) |
| Bundler | Vite 7 |
| Styling | Tailwind CSS v4 + tw-animate-css |
| UI Components | shadcn + Base UI + Radix |
| Icons | Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`) |
| State | Zustand v5 |
| Data Fetching | TanStack Query v5 |
| Forms | TanStack Form + Zod + `@tanstack/zod-form-adapter` |
| i18n | Lingui v5 |
| Animation | Motion |
| Utilities | es-toolkit, clsx, cva, tailwind-merge |
| PWA | Serwist (`@serwist/vite`) |
| Linting | Biome |
| Testing | Vitest + Testing Library + Playwright |
| Git Hooks | Lefthook + Commitlint |
| Fonts | Figtree (Latin) + Noto Sans TC (CJK), both variable |

## Architecture Patterns

### State Management Onion

```
useState (component) → Zustand (global UI) → TanStack Query (server data)
```

**Decision**: Is data needed across components? → Is it server data?

### Zustand Performance Pattern

```typescript
// GOOD: Selector syntax - only re-renders when specific value changes
const sidebarVisible = useUIStore((state) => state.sidebarVisible);

// BAD: Destructuring causes render cascades
const { sidebarVisible } = useUIStore();

// GOOD: Use getState() in callbacks
const handleAction = () => {
  const { data, setData } = useStore.getState();
  setData(newData);
};
```

### React Compiler

Handles memoization automatically — no manual `useMemo`/`useCallback` needed.

### Strict Context Pattern

```typescript
import { getStrictContext } from '@/lib/get-strict-context';

const [MyProvider, useMyContext] = getStrictContext<MyContextType>('MyProvider');
```

### Internationalization (i18n)

```typescript
// React components
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';

function MyComponent() {
  const { i18n } = useLingui();
  return <h1>{i18n._(msg`myFeature.title`)}</h1>;
}

// Non-React contexts
import { i18n } from '@/i18n/config';
i18n._(msg`key`);
```

- Extract: `bun run i18n:extract`
- Compile: `bun run i18n:compile`
- Translations: `src/locales/{locale}/messages.po`

## File Structure

```
src/
├── components/         # React components
│   ├── ui/             # shadcn components
│   ├── ErrorBoundary.tsx
│   └── ThemeProvider.tsx
├── hooks/              # Custom React hooks
├── lib/                # Utilities (utils, get-strict-context, query-client)
├── i18n/               # Lingui i18n setup
├── locales/            # Translation files (.po)
├── store/              # Zustand stores
├── pages/              # Page components
├── routes/             # TanStack Router route files
├── styles/             # CSS (global.css, theme.css, animation.css)
├── test/               # Test setup and utilities
├── App.tsx             # Root component
├── AppProviders.tsx    # Provider wrapper
├── main.tsx            # Entry point
├── router.tsx          # Router configuration
└── sw.ts               # Serwist service worker
```

## Development Commands

```bash
bun run dev              # Start dev server
bun run build            # Production build
bun run preview          # Preview production build
bun run typecheck        # TypeScript check
bun run lint             # Biome lint
bun run lint:fix         # Auto-fix lint issues
bun run format           # Format code
bun run test             # Run tests (watch)
bun run test:run         # Run tests (once)
bun run test:e2e         # Playwright E2E tests
bun run check:all        # Typecheck + lint + format check + test
bun run i18n:extract     # Extract translation strings
bun run i18n:compile     # Compile translations
```

## Adding New Features

### Adding a Route

1. Create `src/routes/my-route.tsx` using `createFileRoute`
2. Create `src/pages/MyPage.tsx` for the page component
3. TanStack Router auto-generates the route tree

### Adding a Component

1. For shadcn: `bunx shadcn@latest add <component>`
2. For custom: create in `src/components/`
3. Use `cn()` from `@/lib/utils` for class merging

### Adding a Store Slice

1. Create `src/store/my-store.ts`
2. Use `create<State>()(devtools(...))` pattern
3. Always use selectors: `useMyStore((s) => s.value)`

### Adding an API Integration

1. Create query functions using TanStack Query
2. Define in feature-specific files
3. Use `queryClient` from `@/lib/query-client`

### Adding a Language

1. Add locale code to `lingui.config.ts` `locales` array
2. Add to `availableLanguages` in `src/i18n/config.ts`
3. Run `bun run i18n:extract` to generate `.po` file
4. Translate strings in `src/locales/{locale}/messages.po`
5. Run `bun run i18n:compile`

## PWA / Serwist

- Service worker: `src/sw.ts`
- Manifest: `public/manifest.json`
- Icons: `public/icons/`
- Registration: automatic in `src/main.tsx`
- Vite plugin configured in `vite.config.ts`

## Testing

- **Unit**: Vitest + Testing Library in `src/**/*.test.{ts,tsx}`
- **E2E**: Playwright in `e2e/*.spec.ts`
- **Test utils**: `src/test/test-utils.tsx` provides `render()` with all providers
- **Setup**: `src/test/setup.ts` mocks `matchMedia`
