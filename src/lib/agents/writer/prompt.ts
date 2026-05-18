// Reusable prompt snippets for writer agents. Each agent composes the snippets
// it actually needs. There is NO base prompt: roles, hard constraints,
// rationale rules, and task scopes all live in each agent's own prompt.ts.

export const NEVER_INVENT = `<never_invent>
NEVER invent technologies, titles, companies, durations, scope, or achievements absent from the profile. Wording can be adapted; facts cannot.
</never_invent>`;
