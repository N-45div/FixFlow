import { defineTool } from "eve/tools";
import { z } from "zod";
import { activeCaseState } from "../lib/state.js";

export default defineTool({
  description: "Read the active maintenance case state for the current session.",
  inputSchema: z.object({}),
  async execute() {
    return activeCaseState.get();
  },
});

