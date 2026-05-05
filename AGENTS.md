## What this project does

**Job Scout** — a Next.js app that automates job searching and tailored document generation:

- **Scout agent** navigates LinkedIn Jobs, evaluates candidates against the user's profile, and persists the best match to SQLite.
- **Writer agent** reads the saved job, selects and rewrites CV bullets, generates a cover letter, then renders both as PDFs via `@react-pdf/renderer`.
- A Next.js dashboard (`src/app/`) exposes the agents through API routes and lets the user track job pipeline status and iterate on generated documents with feedback.

All data is local: SQLite at `data/job-agent.sqlite`, PDFs at `generated-pdfs/<jobId>/<generationId>/`.

## Commands

```bash
npm run dev       # Start Next.js dev server (also runs DB migrations via instrumentation.ts)
npm run build     # Production build
npm run lint      # ESLint
npm test          # Run all Vitest tests (unit + integration, no network)

# Run a single test file
npx vitest run src/lib/db/__tests__/db.test.ts

# Smoke test (requires agent-browser running)
npx vitest run src/lib/agent-browser/__tests__/smoke.test.ts --no-skip
```

## Key architecture decisions

### AI SDK — `ToolLoopAgent` pattern
Both agents use `ToolLoopAgent` from the `ai` package (Vercel AI SDK). Each agent is created in its own `agent.ts`, receives a `RunContext` object mutated by tools, and is invoked via `agent.generate({ prompt })` in its orchestrator. The `stopWhen` predicate checks `ctx.finalized` / `ctx.saveMatchCalled` flags set by terminal tools.

### Profile as single source of truth
`profile.md` is the user's CV. It is parsed at runtime by `src/lib/profile/parse.ts` (frontmatter via `gray-matter` for search config) and `src/lib/agents/writer/orchestrator.ts` (regex parsing for bullet catalog, skills, education). The Writer orchestrator assigns stable `b0`, `b1`, … IDs to every `-` / `*` bullet in document order — these IDs are used by the `selectBullets` tool. Format matters: bullets must use `- text` or `* text`; experience headers must be `### Company | Role | Period`.

### DB migrations
`src/lib/db/migrate.ts` runs on every server start via Next.js instrumentation (`src/instrumentation.ts`). It uses additive `ALTER TABLE` guards (check-then-add) — never destructive. Add new columns there, not in separate migration files.

### `serverExternalPackages`
`better-sqlite3` and `@react-pdf/renderer` are listed in `next.config.js` as `serverExternalPackages` to prevent Next.js from bundling them (native modules and complex bundling respectively).

### Browser automation
`src/lib/agent-browser/exec.ts` wraps the `agent-browser` CLI as a subprocess. All Scout tools call it via thin helper functions (`openUrl`, `snapshot`, `getText`, etc.). The module tracks a `_browserClosed` flag to make `closeBrowser()` idempotent.

### PDF rendering
CV and cover letter are React components in `src/lib/writer/templates/`. They use `@react-pdf/renderer` primitives (`Document`, `Page`, `View`, `Text`). Fonts are bundled as static `.ttf` files next to the templates.

## Environment

Requires a `DEEPINFRA_API_KEY` in `.env` (or `.env.local`). The Scout uses `deepseek-ai/DeepSeek-V4-Flash`; the Writer uses `zai-org/GLM-5.1`, both via `@ai-sdk/deepinfra`.

## Profile format

The Writer's bullet catalog depends on exact markdown structure in `profile.md`:

```markdown
---
search:
  queries:
    - "senior software engineer"
  location: Madrid
  remote: true
---

# Full Name - Current Title
email | phone | location | LinkedIn | website

## Experience

### Company | Job Title | Jan 2022 – Present
- Bullet text used as catalog entry b0
- Bullet text used as catalog entry b1

## Skills
- **Languages**: TypeScript, Go, Python

## Education
- **Degree** | Institution | 2015–2019
```

The frontmatter `search.queries` list drives round-robin query rotation in the Scout orchestrator.
    