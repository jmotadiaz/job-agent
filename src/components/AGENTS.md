This layer contains the UI: components and hooks.

## Rules

- **Logic lives in hooks.** All state, side effects, data fetching, and domain logic must reside in `src/components/hooks/`.
- **Components are for composition only.** Presentational components import hooks and compose markup. Keep them free of direct state or effect logic.
- Prefer small, focused components over large monolithic files.
- Use Tailwind utility classes directly in JSX for layout and one-off styling.
- For repeated UI patterns (buttons, cards, badges), use the custom classes defined in `src/app/style/components.css` (e.g., `.card`, `.btn`, `.badge`) instead of copying the same Tailwind utilities everywhere.
