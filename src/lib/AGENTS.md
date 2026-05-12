This layer contains shared libraries: database, runtime utilities, profile parsing, browser automation, and PDF templates.

## Structure

- **`agents/`**: AI agent orchestration and specific implementations (e.g., Scout, Writer).
- **`agent-browser/`**: Browser automation logic (crawling, interacting with job boards).
- **`db/`**: Database schema, migrations, and access functions.
- **`profile/`**: Parsing and handling of the `profile.md` dossier.
- **`runtime/`**: Core runtime utilities like path resolution, context management, and tracing.
- **`writer/`**: Document generation logic and PDF templates.
- **`utils/`**: Generic shared helper functions.

## Rules

- Keep modules focused on a single domain (DB, runtime, browser, PDF, profile).
- Expose narrow, typed APIs. Avoid leaking implementation details (e.g., raw SQL, internal paths) to consumers.
- Tests live in `__tests__/` folders next to the code they verify.
