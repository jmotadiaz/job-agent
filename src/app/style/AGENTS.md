This folder contains global CSS and custom component classes.

## Creating custom classes

Use the `@apply` directive to compose Tailwind utilities into reusable CSS classes. This is the only way to create custom classes in this project.

```css
.btn {
  @apply inline-flex items-center justify-center gap-[10px] border-none rounded-[2px] cursor-pointer text-[13px] font-medium px-[18px] py-[10px] transition-all duration-200 no-underline uppercase tracking-[0.05em];
}
```

Rules:
- Only use `@apply` inside regular selectors (e.g., `.card`, `.btn-primary`).
- Do **not** use `@apply` inside `@keyframes` — use plain CSS properties there instead.
- Prefer theme values and Tailwind utilities over raw CSS properties when possible.
- Keep component classes in `components.css`; theme variables, base styles, and `@keyframes` stay in `globals.css`.
