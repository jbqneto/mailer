# AGENTS.md

## Goal
Maintain a small internal email gateway. The gateway owns templates, sender policy,
project authentication and delivery orchestration. SMTP providers are infrastructure details.

## Current scope
- Node.js + TypeScript + Fastify
- React Email templates stored in `emails/`
- SMTP delivery via Nodemailer
- API key per project
- Zod validation
- In-memory idempotency only
- No database, queue, dashboard or provider fallback yet

## Architecture rules
1. Keep HTTP, application, template and provider concerns separated.
2. Client projects must never send SMTP credentials, raw HTML or arbitrary `from` addresses.
3. A project API key determines the project and sender configuration.
4. Templates must validate their own payload with Zod.
5. SMTP credentials stay in environment variables only.
6. `EmailProvider` must remain provider-agnostic so Resend/SES/Brevo can be added later.
7. Do not add infrastructure unless a concrete requirement needs it.

## Verification before completing changes
Run:
- `npm run typecheck`
- `npm test`
- `npm run build`

Add or update tests for behavior changes.
Do not log SMTP passwords, API keys, raw HTML or full recipient addresses.
