import { defineState } from "eve/context";
import type { ActiveCaseState } from "./types.js";

export const activeCaseState = defineState<ActiveCaseState>("fixflow.activeCase", () => ({
  stage: "intake",
  issueType: "unknown",
  summary: "",
  language: "en",
  location: "",
  priority: "medium",
  confidence: 0.35,
  probableCause: "",
  nextStep: "",
  blockers: [],
  openQuestions: [],
  attachments: [],
}));
