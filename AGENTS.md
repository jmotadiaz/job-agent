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

When a task changes code or other executable/runtime files, verify the codebase is still healthy before declaring it finished:

1. `pnpm lint` — must pass (no new errors introduced).
2. `pnpm build` — must compile successfully.
3. If you added or changed logic covered by existing tests, run them and ensure they pass.
   - Run all tests: `pnpm test`
   - Run specific tests: `pnpm test -- <path>` (e.g. `pnpm test -- src/lib/agent-browser/__tests__/smoke.test.ts`)

For documentation-only or instruction-only edits (for example `AGENTS.md` or other `*.md` files), these verification commands are not required unless the user asks for them or the edit affects runnable examples/scripts. If checks are skipped because the change is non-code, say so in the final response.

Do not skip required checks for code changes. If lint or build fails, fix the issues before finishing.

<!-- context7 -->
Use the `ctx7` CLI to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service -- even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer -- your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Resolve library: `npx ctx7@latest library <name> "<user's question>"` — use the official library name with proper punctuation (e.g., "Next.js" not "nextjs", "Customer.io" not "customerio", "Three.js" not "threejs")
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question)
3. Fetch docs: `npx ctx7@latest docs <libraryId> "<user's question>"`
4. Answer using the fetched documentation

You MUST call `library` first to get a valid ID unless the user provides one directly in `/org/project` format. Use the user's full question as the query -- specific and detailed queries return better results than vague single words. Do not run more than 3 commands per question. Do not include sensitive information (API keys, passwords, credentials) in queries.

For version-specific docs, use `/org/project/version` from the `library` output (e.g., `/vercel/next.js/v14.3.0`).

If a command fails with a quota error, inform the user and suggest `npx ctx7@latest login` or setting `CONTEXT7_API_KEY` env var for higher limits. Do not silently fall back to training data.
<!-- context7 -->
