# manual-job-fetch Specification

## Purpose
TBD - created by archiving change manual-job-entry. Update Purpose after archive.
## Requirements
### Requirement: Handle Manual Fetch Request
The system SHALL provide an API to fetch and structure job details from a given URL.

#### Scenario: Successful job extraction
- **WHEN** user submits a valid job URL
- **THEN** the system resolves the URL using the browser agent, extracts the main text, creates a structured job row, and persists it to the database with a high "match_score".

#### Scenario: Handle inaccessible URLs
- **WHEN** user submits an invalid or unreachable URL
- **THEN** the system returns a 400 or 500 error clearly indicating the page could not be read.

### Requirement: Dashboard Submission Input
The system SHALL allow users to paste a URL directly from the Dashboard to trigger manual entry.

#### Scenario: Complete manual ingestion flow
- **WHEN** the user pastes a URL and clicks the import button
- **THEN** the UI shows a loading state until the backend creates the new job, inserts the new row in the Dashboard, and enables the Generate CV flow.

