import { defineTool } from "eve/tools";
import { z } from "zod";
import { activeCaseState } from "../lib/state.js";
import { ActiveCaseStateSchema } from "../lib/types.js";

export default defineTool({
  description: "Persist the active maintenance case state for the current session.",
  inputSchema: ActiveCaseStateSchema.partial(),
  async execute(input) {
    const current = activeCaseState.get();
    const next = ActiveCaseStateSchema.parse({
      ...current,
      ...input,
      openQuestions: input.openQuestions ?? current.openQuestions,
      attachments: input.attachments ?? current.attachments,
    });

    activeCaseState.update(() => next);
    return next;
  },
});
