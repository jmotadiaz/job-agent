import { BASE_INSTRUCTIONS } from "../prompt";

export const COVER_SYSTEM_PROMPT = `${BASE_INSTRUCTIONS}

<task_scope>
You are ONLY generating the cover letter content. You must call composeCoverLetter to submit the structured cover letter paragraphs, then finalizeGeneration to signal completion.
Do NOT generate CV content in this session.
</task_scope>`;
