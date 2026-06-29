# FixFlow

FixFlow is a WhatsApp-native maintenance operations copilot for HVAC and facility teams. It turns messy tenant messages, technician photos, fault screenshots, and manual PDFs into a structured incident workflow powered by Gemma on Cerebras, with fast triage, grounded retrieval, and reusable organizational memory.

## Overview

Facility maintenance is still handled through fragmented calls, vague text messages, and tribal knowledge. The result is slow triage, repeated truck rolls, poor handoff quality, and avoidable downtime.

FixFlow solves that by giving teams a conversational front door on WhatsApp and an agentic backend that can:

- understand maintenance reports in natural language
- analyze photos, screenshots, and manuals
- ask only the highest-value follow-up question
- generate dispatch-ready and technician-ready outputs
- learn from past incidents without losing source traceability

## Business Value

FixFlow is built for operational teams that care about response quality, speed, and auditability.

Business outcomes:

- lower time-to-triage for new incidents
- fewer repeat visits caused by missing context
- better technician preparation before arrival
- faster escalation for safety-critical issues
- durable playbooks instead of knowledge trapped in people’s heads

## Who It Serves

- `Tenants and operators`
  Report issues in the most natural way for them: text, images, and PDFs over WhatsApp.
- `Dispatchers`
  Receive cleaner incident structure, fewer ambiguous reports, and clearer next actions.
- `Technicians`
  Arrive with better context, likely causes, and evidence-backed troubleshooting guidance.
- `Operations leaders`
  Build long-term memory and consistent workflows across facilities.

## Product Capabilities

- WhatsApp-first intake for text, images, and PDFs
- attachment evidence extraction from manuals, nameplates, and screenshots
- staged case lifecycle across intake, clarification, diagnosis, and dispatch
- grounded retrieval across memory and trusted external evidence
- governed self-learning through reusable playbooks and incident memory
- multilingual-friendly operational messaging

## Why Cerebras Matters

FixFlow is not just an LLM wrapper. It is a multi-step operational workflow where speed changes usability.

Cerebras makes it practical to:

- run faster multi-step triage without losing conversational flow
- evaluate attachments and structured reasoning within the reply window
- support agent coordination instead of a single slow monolithic answer
- make WhatsApp feel like a live operations interface, not an asynchronous ticket form

The value is not “fast tokens” by itself. The value is better incident handling because the agent can think, retrieve, and respond before the human workflow stalls.

## How It Works

1. A user reports a problem on WhatsApp.
2. FixFlow verifies the inbound Twilio webhook and builds a case context.
3. Text, image, and PDF evidence are normalized into a structured evidence layer.
4. The triage engine classifies the issue, identifies blockers, and determines the next best action.
5. Retrieval combines active case state, memory, and grounded evidence.
6. The coordinator decides what to ask, recommend, or escalate.
7. The system responds in short, field-friendly WhatsApp messages.
8. Resolved cases can later improve long-term memory and reusable playbooks.

## Why This Is Differentiated

Most maintenance assistants either stop at chatbot-style Q&A or use shallow retrieval. FixFlow is designed as an operations system:

- `Workflow-aware`
  It knows whether it should clarify, diagnose, escalate, or dispatch.
- `Evidence-aware`
  It uses manuals, screenshots, and photos as operational inputs.
- `Memory-aware`
  It stores incident knowledge and reusable lessons over time.
- `Governed`
  Learning is not blind accumulation; it is structured and promotion-based.

## Architecture

The system architecture is documented in [ARCHITECTURE.md](C:/Users/DivijN/Documents/Cerebras%20Hackathon/ARCHITECTURE.md).

## Repo Structure

- `agent/` agent runtime, channels, tools, subagents, and core logic
- `evals/` smoke coverage for core flows
- `scripts/` ingestion and seeding helpers
- `data/` local fallback seed data

## Setup

### Core requirements

- Node.js `24.x`
- Twilio WhatsApp Sandbox or production WhatsApp sender
- Cerebras API key

### Environment

Start from `.env.example`.

Required variables:

- `CEREBRAS_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_FROM`
- `TWILIO_WHATSAPP_WEBHOOK_URL`
- `PUBLIC_BASE_URL`

Optional variables:

- `MILVUS_ADDRESS`
- `MILVUS_TOKEN`
- `EXA_API_KEY`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_STATUS_CALLBACK_URL`

### Run locally

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run dev:no-ui
npm run typecheck
npm run build
npm run eval
npm run ingest:manual -- ./path/to/manual.pdf carrier-manual hvac,carrier
```

## Twilio WhatsApp Configuration

1. Start the app locally.
2. Expose it through a public HTTPS tunnel.
3. Set the Twilio incoming WhatsApp webhook to your public URL ending in `/incoming`.
4. Set `TWILIO_WHATSAPP_WEBHOOK_URL` to that same public URL.
5. Join the Twilio sandbox from your device.
6. Send a maintenance report, image, or PDF to begin testing.

## Hackathon Positioning

FixFlow is best positioned for:

- `Track 3: Enterprise Impact`
  It solves a concrete operational problem with measurable productivity and service-quality benefits.
- `Track 1: Multiverse Agents`
  It includes structured orchestration, evidence fusion, and multi-step decisioning rather than a single prompt pipeline.

## Current Demo Scope

Best demoable flows right now:

- tenant sends a text complaint
- tenant sends a photo of equipment or an error screen
- tenant sends a relevant PDF or manual page
- FixFlow returns triage guidance and a structured next step

## Status

Implemented:

- WhatsApp text intake
- WhatsApp image intake
- WhatsApp PDF intake
- attachment evidence extraction
- structured triage workflow
- grounded retrieval and memory recall
- governed learning foundations

Still evolving:

- richer technician and dispatcher output packaging
- stronger evaluation coverage
- production-grade voice-note handling
