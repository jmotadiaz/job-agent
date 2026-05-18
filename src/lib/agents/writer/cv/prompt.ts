import { BASE_INSTRUCTIONS } from "../prompt";

export const CV_SYSTEM_PROMPT = `${BASE_INSTRUCTIONS}

<task_scope>
You are ONLY generating the CV content. You must call composeCV to submit the structured CV data, then finalizeGeneration to signal completion.
Do NOT generate cover letter content in this session.
</task_scope>`;
