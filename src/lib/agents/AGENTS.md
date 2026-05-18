This layer contains AI agent prompts, tools, and orchestration.

## Rules

- **Prompts live in separate files.** Each agent must keep its system prompt(s) in a dedicated `prompt.ts` file next to `agent.ts`.
- **Shared Tool Registry:** All tools must live in the global `src/lib/agents/tools/` folder, one tool per file. This prevents code duplication and makes it clear that tools can be reused across different agents. Do not nest tools inside specific agent folders. Export a factory function (e.g., `makeSaveJobTool`) that receives the run context and returns the tool definition.
- `agent.ts` wires the model, prompt, tools, and stop condition — nothing else.
- `orchestrator.ts` handles run context, browser lifecycle, logging, and result assembly.
- **Agent Conceptualization:** Any node that makes calls to an LLM to generate, plan, or evaluate content is conceptually considered an "Agent" (even if it doesn't use a ToolLoop). Each agent must live in its own dedicated folder (e.g., `cv/`, `cover/`, `plan/`) containing its `agent.ts` (or equivalent execution node) and its own `prompt.ts` file.
- **No base prompts. Each agent owns its full prompt.** An agent's `prompt.ts` must define its own role, hard constraints, rationale rules, and task scope from scratch. Do NOT introduce a monolithic "BASE_INSTRUCTIONS" string that several agents share, even when they have overlapping rules.
- **Reusable snippets are opt-in utilities.** A module-level `prompt.ts` (e.g. `writer/prompt.ts`) may export small named snippets (e.g. `NEVER_INVENT`) that individual agents import and compose into their own system prompt. The composition lives in the agent's `prompt.ts`, never in the utility file.
- **No contra-instructions across composed prompts.** It is unacceptable for an agent to read an instruction it must mentally discard, soften, or scope down. If a snippet would require an override in any agent that imports it, do not import it there — copy the relevant rule inline or split the snippet into smaller pieces.
- **No generic `prompts/` folders:** Do not create a generic `prompts/` folder to group disconnected prompts. Prompts must live next to the code that executes them.
- **Single Responsibility Principle (SRP):** Every file must have a single responsibility and a single reason to change. Do not inline distinct logic blocks (like workflow definitions, decomposers, aggregators, or complex transformations) inside larger files. Extract them into their own dedicated files (e.g., `workflow.ts`, `decomposer.ts`, `aggregator.ts`). A file should only change when its specific domain logic changes.
- Keep tool implementations thin: parse arguments, call `src/lib/` utilities, and mutate context.
