## Why

The current workflow relies exclusively on the automated Scout agent to find and filter jobs from LinkedIn. However, users often discover interesting job offers manually (through connections, other portals, or direct links) and want to generate a tailored CV and Cover Letter immediately without waiting for the Scout to pick it up. This change introduces an "on-demand" generation flow from a direct job URL.

## What Changes

- Add a new "Direct URL" or "Add Job" input to the Dashboard UI, allowing users to paste a job posting URL.
- Implement a backend extraction process that uses deterministic scraping (`agent-browser`) to pull the raw HTML/text of the pasted URL.
- Use a lightweight LLM (Llama 3.1 8B) to quickly parse the essential structured fields (Company, Title, Location) strictly for UI purposes, ensuring the Job row looks clean in the dashboard.
- Automatically insert the manually added job into the database with a high match score and "shortlisted" status by default.
- Automatically trigger the existing CV Writer generation flow, producing the PDFs using the scraped text.

## Capabilities

### New Capabilities
- `manual-job-fetch`: Fetch, structure, and save job details from a user-provided URL, bypassing the automated scouting loop.

### Modified Capabilities
- (None)

## Impact

- **UI**: Added input controls in `/src/app/Dashboard.tsx` and modified the jobs state.
- **Backend/Agents**: Creation of a fast extraction utility (`src/lib/agents/manual/` or similar API route) that combines `agent-browser` + structure extraction.
- **Data**: Minor change in UI to support jobs added with `"source": "manual"`.
