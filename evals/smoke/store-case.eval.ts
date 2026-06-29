import { defineEval } from "eve/evals";

export default defineEval({
  description: "The agent can checkpoint a resolved maintenance incident into episodic memory.",
  async test(t) {
    await t.send("remember leak case");
    t.succeeded();
    t.calledTool("store_case_resolution");
  },
});
