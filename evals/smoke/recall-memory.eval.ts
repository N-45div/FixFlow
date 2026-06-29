import { defineEval } from "eve/evals";

export default defineEval({
  description: "The agent can recall seeded maintenance knowledge through the memory tool.",
  async test(t) {
    await t.send("find leak knowledge");
    t.succeeded();
    t.calledTool("recall_memory");
  },
});

