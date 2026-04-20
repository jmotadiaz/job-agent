## Context

Currently, jobs enter the system strictly through the Scout agent, which iterates through search results. Users want a way to import jobs on-demand via URL. This requires an ingestion mechanism that works without an established `jobId`, scrapes the job ad deterministically, structures basic metadata to keep the UI clean, and saves it into the database so the standard Writer pipeline can generate documents.

## Goals / Non-Goals

**Goals:**
- Provide a robust way to scrape a URL on demand.
- Extract basic metadata (Company, Title) to display clearly in the UI.
- Pre-fill a job row in the database so the `GET /api/jobs` query works out of the box and CV generation proceeds smoothly.

**Non-Goals:**
- Full headless LLM matching for manual jobs (user decides if it's a match).
- Supporting jobs hidden behind impenetrable authentication walls (some fallback manual text-pasting might be added later, but for now we focus on URLs).

## Decisions

**1. Scraping Mechanism: Deterministic `getText` with Playwright**
We will reuse `runAgentBrowser` / `getText("main")` already configured in the Job-Agent. This is much faster and more reliable than a specialized unstructured scraper. 

**2. Metadata Extraction: Micro-LLM Call (Llama 3.1 8B)**
A quick call to the existing cheap/fast LLM extracts Company, Title, and Location. This is needed because `getText("main")` produces unformatted text, and a proper `Job` row needs these distinct fields.

**3. Application Flow: New Endpoint**
We will expose an endpoint `POST /api/jobs/manual` that receives `{ "url": string }`. It runs the scrape, makes the LLM call, saves the job with `source: 'manual'` and `match_score: 1.0`, and returns the `jobId`. 
The frontend will have an input to trigger this API, and once successful, will refresh the `initialJobs` store and trigger generation.

## Risks / Trade-offs

- **[Risk]** Scraping fails due to CAPTCHA or Login walls on non-LinkedIn boards. 
  → **Mitigation**: We instruct `agent-browser` to try common dismissals for cookie walls. For deeper paywalls, this workflow will gracefully fail and display an error toast on the frontend.
- **[Risk]** Timeout during scraping + LLM structure extraction.
  → **Mitigation**: The extraction prompt is extremely small and we use Llama 3 8B. Playwright will be constrained to a 5-second `waitLoad`.
