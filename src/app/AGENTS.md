This layer contains Next.js App Router pages, global styles, and API Route Handlers.

## Structure

- **`src/app/`** — page routes (`page.tsx`, `layout.tsx`) only.
- **`src/app/api/`** — API Route Handlers (`route.ts`).
- **`src/app/style/`** — global CSS, custom theme variables, and component classes.

## Rules

- Pages must contain **only** Next.js routing logic and component composition from `src/components/`.
- No business logic, state management, or data fetching directly in page files — delegate to hooks and components.
- API routes are thin adapters: validate input, call `src/lib/` functions, and return JSON. No agent orchestration or heavy logic inside route handlers.


