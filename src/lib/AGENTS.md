This layer contains shared libraries: database, runtime utilities, profile parsing, browser automation, and PDF templates.

## Rules

- Keep modules focused on a single domain (DB, runtime, browser, PDF, profile).
- Expose narrow, typed APIs. Avoid leaking implementation details (e.g., raw SQL, internal paths) to consumers.
- Tests live in `__tests__/` folders next to the code they verify.


