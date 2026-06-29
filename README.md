# FixFlow

FixFlow is a WhatsApp-first maintenance copilot for HVAC and facility teams. It helps tenants report issues in plain language, gives dispatchers structured triage, and produces technician-friendly next steps powered by Gemma on Cerebras.

## What it does

- accepts WhatsApp text, images, and PDF attachments
- extracts structured evidence from manuals, screenshots, and equipment photos
- runs a staged case workflow for intake, clarification, diagnosis, and dispatch
- combines memory, grounded retrieval, and governed learning
- replies in short field-friendly WhatsApp messages

## Why it matters

Most maintenance reporting is messy: vague symptoms, missing photos, scattered manuals, and repeated issues that nobody properly documents. FixFlow turns that into a reusable incident workflow instead of another chatbot answer.

The product is designed for:

- tenants or operators reporting issues
- dispatchers who need fast triage
- technicians who need grounded troubleshooting context

## Current stack

- `Eve` for agent orchestration and durable state
- `Cerebras + Gemma` for fast reasoning and multimodal analysis
- `Twilio WhatsApp` for the user-facing channel
- `Milvus` plus local JSON fallback for memory
- `Exa` for trusted-domain grounded web retrieval

## Current status

Working now:

- WhatsApp text intake
- WhatsApp image intake
- WhatsApp PDF intake
- structured triage workflow
- attachment evidence extraction
- memory recall and playbook storage

Not fully finished yet:

- voice-note transcription on WhatsApp
- richer dispatcher and technician output formats
- stronger eval coverage across issue types

## Retrieval approach

FixFlow is not plain vector-search RAG.

The retrieval path is:

1. session state
2. incident and playbook memory recall
3. grounded lookup across memory and web evidence
4. trust and freshness scoring
5. conflict marking before the final answer

That makes the system more operationally reliable than a single nearest-neighbor lookup.

## Repo layout

- `agent/` core agent, channels, tools, subagents, and runtime logic
- `docs/` roadmap and architecture notes
- `evals/` smoke evals
- `scripts/` ingestion and seeding scripts
- `data/` local memory fallback data

The roadmap lives in [docs/roadmap.md](C:/Users/DivijN/Documents/Cerebras%20Hackathon/docs/roadmap.md).

## Twilio WhatsApp setup

1. Start the app with `npm run dev`.
2. Expose it through a public HTTPS tunnel.
3. Set the Twilio WhatsApp sandbox incoming webhook to your public URL ending in `/incoming`.
4. Set `TWILIO_WHATSAPP_WEBHOOK_URL` to that same public URL.
5. Set `TWILIO_MESSAGING_FROM` to your sandbox sender, for example `whatsapp:+14155238886`.

Optional:

- set `TWILIO_PHONE_NUMBER` if you want the phone/SMS companion flow
- set `TWILIO_STATUS_CALLBACK_URL` if you want outbound delivery callbacks

## Environment

Copy from `.env.example` and fill what you need.

Most important variables:

- `CEREBRAS_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_FROM`
- `TWILIO_WHATSAPP_WEBHOOK_URL`
- `PUBLIC_BASE_URL`

Optional:

- `MILVUS_ADDRESS`
- `MILVUS_TOKEN`
- `EXA_API_KEY`

## Local commands

```bash
npm run dev
npm run dev:no-ui
npm run typecheck
npm run build
npm run eval
npm run ingest:manual -- ./path/to/manual.pdf carrier-manual hvac,carrier
```

## Demo framing

For the hackathon, the strongest story is:

- WhatsApp is the front door
- Gemma on Cerebras is the decision engine
- memory makes the system improve over time
- grounded evidence keeps the workflow auditable
- speed matters because maintenance triage is operational, not academic
