## 1. Backend API & Extractor

- [x] 1.1 Create `src/lib/agents/manual/extractor.ts` with a function `extractJobFromUrl(url: string)` that uses `openUrl` and `getText` from `agent-browser`.
- [x] 1.2 Implement the Llama 3 8B LLM structurization inside `extractJobFromUrl` to get Title, Company, and Location cleanly.
- [x] 1.3 Create `src/app/api/jobs/manual/route.ts` (POST) that accepts `{ url: string }`.
- [x] 1.4 Wire the API route to use `extractJobFromUrl`, create a `Job` object (match_score: 1.0, source: 'manual'), call `insertJob`, and return the job data.

## 2. Frontend Integration

- [x] 2.1 Update `src/app/Dashboard.tsx` to include an input field and button for pasting the URL (e.g., "Add from URL").
- [x] 2.2 Wire the frontend button to `POST /api/jobs/manual`, showing a loading spinner while fetching.
- [x] 2.3 Ensure successful import adds the new job to the top of the list in the Dashboard and alerts the user.

## 3. Testing & Polish

- [ ] 3.1 Test the new flow with a regular LinkedIn URL to confirm structure extraction works.
- [ ] 3.2 Ensure CV generation triggers perfectly using a manually imported job.
