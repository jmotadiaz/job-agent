This layer contains AI agent prompts, tools, and orchestration.

## Rules

- **Prompts live in separate files.** Each agent must keep its system prompt(s) in a dedicated `prompt.ts` file next to `agent.ts`.
- **Shared Tool Registry:** All tools must live in the global `src/lib/agents/tools/` folder, one tool per file. This prevents code duplication and makes it clear that tools can be reused across different agents. Do not nest tools inside specific agent folders. Export a factory function (e.g., `makeSaveJobTool`) that receives the run context and returns the tool definition.
- `agent.ts` wires the model, prompt, tools, and stop condition — nothing else.
- `orchestrator.ts` handles run context, browser lifecycle, logging, and result assembly.
- **Agent Conceptualization:** Any node that makes calls to an LLM to generate, plan, or evaluate content is conceptually considered an "Agent" (even if it doesn't use a ToolLoop). Each agent must live in its own dedicated folder (e.g., `cv/`, `cover/`, `plan/`) containing its `agent.ts` (or equivalent execution node) and its own `prompt.ts` file.
- **Base Prompts:** A `prompt.ts` file at the root of a module (e.g., `writer/prompt.ts`) is used exclusively for generic Base Instructions. It contains shared rules, hard constraints, and structure definitions that specific agents import and extend in their own `prompt.ts` files. 
- **No generic `prompts/` folders:** Do not create a generic `prompts/` folder to group disconnected prompts. Prompts must live next to the code that executes them.
- **Single Responsibility Principle (SRP):** Every file must have a single responsibility and a single reason to change. Do not inline distinct logic blocks (like workflow definitions, decomposers, aggregators, or complex transformations) inside larger files. Extract them into their own dedicated files (e.g., `workflow.ts`, `decomposer.ts`, `aggregator.ts`). A file should only change when its specific domain logic changes.
- Keep tool implementations thin: parse arguments, call `src/lib/` utilities, and mutate context.
