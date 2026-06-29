# FixFlow Voice Roadmap

This file is the execution plan for turning the current prototype into a hackathon-grade product.

It is organized into phases so we can keep shipping in a disciplined order:

1. make inbound evidence useful
2. make the agent workflow more structured
3. make retrieval more trustworthy
4. make memory safer and more durable
5. make the channel experience feel polished
6. make the system measurable and demo-ready

## Status snapshot

### Done

- Eve agent scaffold is in place
- WhatsApp custom channel is wired through Twilio
- optional Twilio voice/SMS channel is wired
- Cerebras provider is integrated via `@ai-sdk/cerebras`
- Milvus plus local JSON fallback memory exists
- incident recall and playbook distillation exist
- grounded lookup over memory plus web exists
- triage workflow exists

### Next priority

Phase 1: attachment intelligence

That is the highest-leverage improvement because WhatsApp is already the front door. The next jump in product quality comes from actually extracting structured signal from images and PDFs rather than only forwarding raw files to the model.

## Phase 0: Foundation

### Goal

Ship the baseline agent, channels, memory store, and first triage workflow.

### Status

In place

### Delivered

- `agent/channels/whatsapp.ts`
- `agent/channels/twilio.ts`
- `agent/lib/memory-store.ts`
- `agent/lib/grounded-retrieval.ts`
- `agent/lib/triage-engine.ts`
- `agent/tools/run_triage_workflow.ts`

## Phase 1: Attachment intelligence

### Goal

Convert WhatsApp attachments into structured operational evidence the agent can reuse.

### Why it matters

This is what makes the interface feel native to maintenance operations. Users should be able to send a photo, nameplate, fault screenshot, or manual PDF and have the agent extract what matters.

### Todo

- [x] Add a normalized attachment extraction pipeline in `agent/lib/attachments.ts`
- [x] Parse PDFs into text chunks and metadata
- [x] Add OCR support for images
- [x] Detect likely asset labels, model numbers, serial numbers, warning labels, and fault codes
- [x] Store extracted attachment facts in case state
- [x] Store durable attachment-derived knowledge with provenance
- [x] Add a tool that lets the agent inspect extracted attachment evidence without rereading the full file
- [x] Add file-size and media-type safety limits

### Acceptance criteria

- A user can send a manual PDF and the agent can cite relevant extracted text
- A user can send an equipment photo and the agent can summarize visible identifiers
- The case state includes structured evidence derived from attachments

## Phase 2: Structured case lifecycle

### Goal

Turn the current triage workflow into a proper multi-step case machine.

### Why it matters

A serious operations copilot should not behave like a single prompt-response bot. It should know whether it is clarifying, diagnosing, dispatching, resolving, or learning.

### Todo

- [x] Expand case state to track stage, blockers, pending questions, and confidence
- [x] Add explicit lifecycle states: `intake`, `clarification`, `diagnosis`, `dispatch`, `resolution`, `closed`
- [x] Add a next-best-question policy for missing critical information
- [ ] Add issue-specific orchestration paths for HVAC cooling, leaks, electrical hazards, and air quality
- [ ] Add a dispatcher-facing structured summary format
- [ ] Add a technician-facing action checklist format
- [ ] Add a resolution closeout path that triggers governed learning

### Acceptance criteria

- The agent can ask only the most important follow-up question at each stage
- The current case stage is readable from state
- Resolved incidents can move cleanly into the learning flow

## Phase 3: Citation-grade grounded retrieval

### Goal

Make retrieval more precise, auditable, and resistant to noisy search results.

### Why it matters

The retrieval strategy is already better than plain vector search, but it still needs stronger evidence ranking and answer grounding to feel trustworthy.

### Todo

- [ ] Add query decomposition by issue type, asset type, and symptom
- [x] Add source trust scoring and freshness scoring
- [x] Add exact snippet citation support for memory and web evidence
- [ ] Add retrieval fallback policy when web results are weak
- [x] Add a compact evidence ranking explanation for the agent
- [x] Add a conflict marker when sources disagree
- [ ] Add a clear distinction between known facts, inferred hypotheses, and recommended actions

### Acceptance criteria

- Answers can point to exact evidence snippets
- Weak web results do not dominate stronger memory or manual evidence
- The agent can explain why one source was prioritized

## Phase 4: Governed self-learning

### Goal

Upgrade memory from "store useful things" to a governed learning system that gets better without drifting.

### Why it matters

This is one of the strongest differentiators for the project. The novelty is not just memory, but memory with promotion rules, conflict checks, and durability.

### Todo

- [x] Only promote learning from resolved or high-confidence incidents
- [ ] Cluster similar incidents before playbook promotion
- [x] Add playbook versioning instead of overwrite-only updates
- [ ] Add freshness, review timestamps, and decay metadata
- [x] Add contradiction scoring beyond simple keyword heuristics
- [ ] Add human-review-ready promotion summaries
- [ ] Add a rollback or deprecation path for bad playbooks
- [ ] Add graph links between assets, symptoms, causes, and fixes

### Acceptance criteria

- Playbooks have versions and provenance
- Contradictory lessons are surfaced before promotion
- Stale knowledge can be reviewed or deprecated

## Phase 5: WhatsApp UX and operational polish

### Goal

Make the agent feel excellent inside WhatsApp for real users in the field.

### Why it matters

Hackathon demos win when the workflow feels natural, not just technically complete.

### Todo

- [ ] Add automatic bilingual response switching
- [ ] Add concise message chunking and formatting tuned for WhatsApp
- [ ] Add media-aware prompts such as asking for a nameplate photo or breaker panel photo
- [ ] Add emergency escalation language for electrical and water hazards
- [ ] Add duplicate webhook and retry handling
- [ ] Add idempotency for inbound message processing
- [ ] Add better outbound error handling and fallback text

### Acceptance criteria

- The agent replies cleanly in short field-friendly messages
- Duplicate webhook deliveries do not create duplicate case updates
- Safety-critical issues trigger stronger escalation phrasing

## Phase 6: Evals, resilience, and demo proof

### Goal

Make the system measurable, testable, and stable enough for repeated demos.

### Why it matters

This is the difference between a promising prototype and a convincing submission.

### Todo

- [ ] Add evals for no-cooling, water leak, electrical hazard, air quality, and after-hours emergency
- [ ] Add bilingual eval cases including Hinglish and Spanish
- [ ] Add attachment evals for photo plus PDF/manual flows
- [ ] Add bad-web-result contamination evals
- [ ] Add memory-promotion evals
- [ ] Add structured logs for case state transitions
- [ ] Add failure telemetry around Twilio, Cerebras, Exa, and Milvus
- [ ] Add a seeded end-to-end demo script

### Acceptance criteria

- Core scenarios have repeatable eval coverage
- Major failure points emit useful logs
- We can run a stable demo with known prompts and expected outcomes

## Immediate build order

This is the recommended implementation order from here:

1. Phase 1: attachment intelligence
2. Phase 2: structured case lifecycle
3. Phase 3: citation-grade grounded retrieval
4. Phase 6: evals for the new behavior
5. Phase 4: deeper governed learning upgrade
6. Phase 5: WhatsApp polish and operational hardening

## Current working set

These are the next concrete tasks to execute in code:

- [x] Create attachment extraction library and types
- [x] Add extracted attachment evidence to active case state
- [x] Add PDF text extraction path
- [x] Add OCR image extraction path
- [x] Add initial attachment eval coverage

When these are done, move immediately into Phase 2.
