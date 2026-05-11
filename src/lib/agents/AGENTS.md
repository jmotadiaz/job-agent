This layer contains AI agent prompts, tools, and orchestration.

## Rules

- **Prompts live in separate files.** Each agent must keep its system prompt(s) in a dedicated `prompt.ts` file next to `agent.ts`.
- **Tools live in `tools/`**, one tool per file. Export a factory function (e.g., `makeSaveJobTool`) that receives the run context and returns the tool definition.
- `agent.ts` wires the model, prompt, tools, and stop condition — nothing else.
- `orchestrator.ts` handles run context, browser lifecycle, logging, and result assembly.
- Keep tool implementations thin: parse arguments, call `src/lib/` utilities, and mutate context.
