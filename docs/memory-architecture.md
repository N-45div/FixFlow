# Memory Architecture

## Goal

FixFlow Voice should improve over time without turning into a bag of unsafe anecdotes.

The design follows a simple principle:

- remember concrete incidents as `episodic memory`
- distill stable procedures as `semantic playbooks`
- keep active conversation facts in `session state`
- only promote memories after a checkpointed review

## The write-manage-read loop

### Write

New information enters through:

- `update_active_case`
- `store_case_resolution`
- `register_knowledge_snippet`
- `checkpoint_learning`
- `reflect_and_store_playbook`

### Manage

Before reusable guidance is promoted:

- retrieve similar incidents
- retrieve existing playbooks
- check for contradictions
- gate promotion on confidence

### Read

At answer time, the agent should prefer:

1. active session state
2. approved playbooks
3. similar historical incidents
4. external trusted web sources

In code, this is implemented as a retrieval cascade instead of a pure vector-only RAG layer.

The new `grounded_lookup` path:

- expands the query into multiple operational variants
- searches long-term memory across scopes
- searches trusted web domains with content extraction
- reranks evidence across memory and web
- returns a compact evidence bundle for the main agent

## Memory types

### Session state

Stored with Eve `defineState`.

Used for:

- active summary
- probable cause
- priority
- next step
- open questions

### Incident memory

Stored as case records in Milvus or the local JSON fallback.

Each record carries:

- title
- symptoms / diagnosis / action / outcome text
- confidence
- tags
- evidence
- source
- created time

### Playbook memory

A distilled reusable lesson with:

- applicability conditions
- prerequisites
- ordered steps
- stop conditions
- limitations
- confidence

## Checkpointed self-learning

`checkpoint_learning` is the key novelty in this repo.

It does four things in order:

1. stores the resolved incident
2. distills a candidate playbook
3. compares it against existing playbooks
4. promotes it only if the checkpoint is safe

This keeps learning additive but governed.

## Why this is safer than naive memory

Naive agent memory often fails because it writes too much, too early, and without provenance.

This design avoids that by:

- separating incidents from playbooks
- requiring evidence on memory writes
- keeping a conflict check before promotion
- preserving uncertainty when confidence is low
- letting Eve checkpoints persist the workflow between steps

## Future upgrades

- media-aware Twilio custom channel for WhatsApp images
- richer contradiction scoring beyond simple heuristics
- explicit human approval for playbook promotion
- playbook freshness and deprecation policy
- graph links between equipment types, symptoms, and outcomes
