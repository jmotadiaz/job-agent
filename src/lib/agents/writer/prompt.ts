// Reusable prompt snippets for writer agents. Each agent composes the snippets
// it actually needs. There is NO base prompt: roles, hard constraints,
// rationale rules, and task scopes all live in each agent's own prompt.ts.

export const NEVER_INVENT = `<never_invent>
NEVER invent technologies, titles, companies, durations, scope, or achievements absent from the profile. Wording can be adapted; facts cannot.
</never_invent>`;

export const PROFILE_DOSSIER_RULES = `<profile_dossier_rules>
The candidate_profile is an evidence dossier, not a finished CV.

How to read it:
- "Professional Snapshot" contains high-level candidate facts and positioning, not polished CV copy.
- "Dossier Usage Notes" and "Generation Guidance" are selection guidance only. Do NOT quote them as candidate achievements.
- "Evidence Card" sections are the primary source for experience facts.
- "Skill Evidence Block" sections explain when a skill is supported and what must NOT be inferred.
- "Reusable claim fragments" are verified raw material. They are NOT final bullets; rewrite them for the offer while preserving facts exactly.
- "Ownership-safe verbs" are binding. Choose final verbs from that list, or a weaker synonym, for claims from that Evidence Card.
- "Boundaries / do not infer", "Unknowns", and "Limits" are prohibitions. Never turn them into positive claims.

Grounding rules:
- Prefer Evidence Card fields in this order: Measured outcomes, Observed outcomes, Implementation evidence, Technical approach, Ownership, Situation / context.
- Use Generation Guidance only to prioritize evidence, never as factual support.
- If a claim is only listed as a skill with no supporting Evidence Card, include the skill only when relevant; do not attach project outcomes to it.
- Any number, percentage, company, title, period, tool, or scope in final output must be traceable to an Evidence Card, Skill Evidence Block, Professional Snapshot, or Education entry.
- Never upgrade ownership. If the Evidence Card says "co-designed", the final output may say "Co-designed", "Collaborated on", or "Contributed to", but must NOT say "Engineered", "Built", "Owned", "Led", or "Architected".
- Write metric changes in prose. Use "from 16% to 5.6%", "increased by 256%", "reduced by 34.31%", and "cut by ~300ms". Do NOT use arrow symbols, curly quote separators, plus-sign shorthand, or minus-sign shorthand in final CV/cover text.
</profile_dossier_rules>`;
