# Job Scout

> **Local-only AI agent that scouts LinkedIn for matching jobs and generates tailored CVs + cover letters.**

---

## Overview

Job Scout is a Next.js application that runs entirely on your machine. It uses two AI agents:

- **Scout** — Navigates LinkedIn Jobs, evaluates candidates against your profile, and persists matching offers.
- **Writer** — Adapts your CV bullets and writes a cover letter for a specific job. Supports iterative refinement via human feedback.

All data is stored locally in a SQLite database. No cloud services required beyond AI API calls.

---

## Requirements

| Tool | Notes |
|---|---|
| Node.js ≥ 20 | LTS recommended |
| `agent-browser` CLI | Browser automation tool |
| DeepInfra API key | For both Scout and Writer LLM calls |

---

## Setup

### 1. Install agent-browser

```bash
npm install -g agent-browser
# or locally:
npm install agent-browser
```

> Verify it works: `agent-browser --help`

### 2. Create your profile

```bash
cp profile.md.example profile.md
```

Edit `profile.md` to fill in your personal info, experience bullets (in `- bullet text` format), skills, education, and the `## search` section:

```markdown
## search
query: senior software engineer
location: Madrid
remote: true
experience_level: senior  # entry | mid | senior
job_type: full-time        # optional
```

### 3. Configure API keys

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
DEEPINFRA_API_KEY=your_key_here
```

### 4. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the dashboard loads immediately.

---

## Using the dashboard

### Finding jobs

Click **🔍 Find new job** in the header. The Scout agent will:

1. Open LinkedIn Jobs with your search query
2. List visible job cards (filtering already-seen ones)
3. Evaluate up to 5 candidates against your profile
4. Persist the best match as *Shortlisted* (or report *No match*)

### Generating CV + cover letter

Click **✨ Generate** on any job row. The Writer agent will:

1. Select the most relevant bullets from your profile
2. Adapt their phrasing to the job description (without inventing facts)
3. Write a tailored cover letter
4. Render both as PDFs and make them available for download

### Iterating with feedback

After a generation appears, click **💬 Iterate with feedback**, rate the result (1–5 stars), add an optional comment, and click **✨ Iterate**. The Writer will produce an improved version that responds to your feedback.

> **⚠ Profile changed badge**: If you edit `profile.md` after generating, affected generations will show a warning badge. Regenerate to keep documents in sync.

### Job status

Use **✓ Mark as Applied** and **✕ Discard** to track your pipeline. Tabs at the top filter by status.

---

## Manual operational commands

### Run the Scout via curl

```bash
curl -X POST http://localhost:3000/api/scout/run
```

### Trigger PDF generation

```bash
curl -X POST http://localhost:3000/api/writer/generate \
  -H 'Content-Type: application/json' \
  -d '{"jobId": "<id-from-db>"}'
```

### Iterate with feedback

```bash
curl -X POST http://localhost:3000/api/writer/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "jobId": "<id>",
    "parentGenerationId": "<generation-id>",
    "feedbackRating": 3,
    "feedbackComment": "Emphasize leadership more"
  }'
```

### Inspect the database

```bash
sqlite3 data/job-agent.sqlite

# List all jobs
SELECT id, title, company, status, match_score FROM jobs ORDER BY fetched_at DESC;

# List generations for a job
SELECT id, parent_generation_id, feedback_rating, created_at FROM generations WHERE job_id = '<id>';
```

### Filter logs by module

```bash
# All Scout-related logs
npm run dev 2>&1 | grep '\[scout/'

# Writer logs only
npm run dev 2>&1 | grep '\[writer/'

# All errors
npm run dev 2>&1 | grep 'error'

# Specific job persist events
npm run dev 2>&1 | grep 'scout/orchestrator.*persist'
```

---

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── scout/run/route.ts        — POST: trigger scout
│   │   ├── writer/generate/route.ts  — POST: generate or iterate
│   │   ├── jobs/[id]/route.ts        — GET/PATCH: job details + status
│   │   └── generations/[id]/         — cv/route.ts, cover/route.ts
│   ├── Dashboard.tsx                 — Main client component
│   └── page.tsx                      — Server component (loads jobs)
└── lib/
    ├── agent-browser/exec.ts         — CLI subprocess wrapper
    ├── agents/
    │   ├── scout/                    — agent, tools, orchestrator, types
    │   └── writer/                   — agent, tools, orchestrator
    ├── db/                           — client, migrate, jobs, generations
    ├── log.ts                        — Structured logging wrapper
    ├── profile/                      — load, parse, hash
    └── writer/templates/             — cv.tsx, cover-letter.tsx (React-PDF)
```

---

## Running tests

```bash
# All unit + integration tests (mocked, no network)
npm run test

# Specific file
npx vitest run src/lib/db/__tests__/db.test.ts

# Agent-browser smoke test (requires running browser)
npx vitest run src/lib/agent-browser/__tests__/smoke.test.ts --no-skip
```

---

## Data files

| Path | Description |
|---|---|
| `profile.md` | Your CV source (gitignored) |
| `data/job-agent.sqlite` | Local database (gitignored) |
| `generated-pdfs/` | Output PDFs keyed by `jobId/generationId/` (gitignored) |
| `.env.local` | API keys (gitignored) |
