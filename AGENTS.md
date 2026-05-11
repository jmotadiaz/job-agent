This is **Job Scout** — a Next.js app that automates job searching and tailored document generation (CV + cover letter as PDFs).

```bash
npm run dev       # Start Next.js dev server (runs DB migrations via instrumentation.ts)
npm run build     # Production build
npm run lint      # ESLint
npm test          # Run all Vitest tests
```

## Project intent

- **Automate the tedious parts of job hunting.** The agents handle browsing, evaluation, and document rewriting so the user only intervenes where judgment matters.
- **Every output is tailored, not generic.** CV and cover letter must read like they were written for that specific offer.
- **The user iterates with feedback.** The dashboard lets the user review, give feedback, and regenerate.

### `profile.md` — raw material for both agents

`profile.md` is **not the CV**. It is a deliberately oversized dossier of the user's career — every role, achievement, metric, and stack detail. Both agents treat it as raw material:

- **Scout** receives the full markdown to evaluate fit (hard blockers, seniority, stack, location).
- **Writer** parses it at runtime into a bullet catalog with stable `b0`, `b1`, … IDs; the `selectBullets` tool picks and rewrites the bullets that best match the saved offer.

The richer `profile.md` is, the better the Writer can tailor outputs. **Maintenance guideline**: err on the side of more detail (quantified impact, technologies, scope). The Writer can shorten, but cannot invent missing material.

Format matters because the Writer parses with regex: bullets must use `- text` or `* text`; experience headers must be `### Company | Role | Period`. Frontmatter search config is parsed via `gray-matter`.

Requires a `DEEPINFRA_API_KEY` in `.env` (or `.env.local`). The Scout uses `deepseek-ai/DeepSeek-V4-Flash`; the Writer uses `zai-org/GLM-5.1`, both via `@ai-sdk/deepinfra`.

## Task completion checklist

Before declaring a task finished, verify the codebase is still healthy:

1. `npm run lint` — must pass (no new errors introduced).
2. `npm run build` — must compile successfully.
3. If you added or changed logic covered by existing tests, run them with `npx vitest run <path>` and ensure they pass.

Do not skip these steps. If lint or build fails, fix the issues before finishing.
