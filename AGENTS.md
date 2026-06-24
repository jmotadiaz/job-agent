This is **Job Scout** — a Next.js app that automates job searching and tailored document generation (CV + cover letter as PDFs).

```bash
pnpm dev          # Start Next.js dev server (runs DB migrations via instrumentation.ts)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Run Vitest tests
```

## Project intent

- **Automate the tedious parts of job hunting.** The agents handle browsing, evaluation, and document rewriting so the user only intervenes where judgment matters.
- **Every output is tailored, not generic.** CV and cover letter must read like they were written for that specific offer.
- **The user iterates with feedback.** The dashboard lets the user review, give feedback, and regenerate.

### `profile.md` — raw material for both agents

`profile.md` is **not the CV**. It is a deliberately oversized dossier of the user's career — every role, achievement, metric, and stack detail. Both agents treat it as raw material:

- **Scout** receives the full markdown to evaluate fit (hard blockers, seniority, stack, location).
- **Writer** uses the full profile as context to select and rewrite the most relevant material for each offer.

The richer `profile.md` is, the better the Writer can tailor outputs. **Maintenance guideline**: err on the side of more detail (quantified impact, technologies, scope). The Writer can shorten, but cannot invent missing material.

`profile.md` uses YAML frontmatter (parsed via `gray-matter`) to hold search configuration (filters, preferences, blocklist). The body is free-form markdown.

## Project structure

This project uses a progressive disclosure strategy for agent instructions. Place new files in the correct directory so the relevant `AGENTS.md` is automatically applied:

- **`src/app/`**: Next.js App Router pages, api routes, layouts and styles.
- **`src/components/`**: Reusable React UI components and React hooks.
- **`src/lib/`**: Core backend business logic.


## Task completion checklist

Before declaring a task finished, verify the codebase is still healthy:

1. `pnpm lint` — must pass (no new errors introduced).
2. `pnpm build` — must compile successfully.
3. If you added or changed logic covered by existing tests, run them and ensure they pass.
   - Run all tests: `pnpm test`
   - Run specific tests: `pnpm test -- <path>` (e.g. `pnpm test -- src/lib/agent-browser/__tests__/smoke.test.ts`)

Do not skip these steps. If lint or build fails, fix the issues before finishing.
