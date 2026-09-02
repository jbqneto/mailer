# AGENTS.md

## Goal
Maintain a small internal email gateway. The gateway owns templates, sender policy,
project authentication and delivery orchestration. SMTP providers are infrastructure details.

## Current scope
- Node.js + TypeScript + Fastify
- React Email templates stored under `templates/$project/`
- SMTP delivery via Nodemailer
- API key per project
- Zod validation
- In-memory delivery records and idempotency by default
- In-process background email queue by default
- Optional durable delivery records and job queue through Supabase
- Authenticated HTML template preview workspace at `/preview`
- Prometheus-compatible aggregated metrics at `/metrics`
- Per-project rate limiting and SMTP retry policy
- No provider fallback yet

## Persistence and queue modes
The default local-development mode uses in-memory adapters:

- `DELIVERY_STORE=memory` stores delivery history and idempotency reservations in
  process memory, with a 24-hour idempotency TTL.
- `QUEUE_STORE=memory` runs the worker in the Node.js process.

Production deployments may opt into Supabase:

- `DELIVERY_STORE=supabase` persists delivery records and idempotency keys in
  `email_gateway.email_deliveries`.
- `QUEUE_STORE=supabase` persists rendered email jobs in
  `email_gateway.email_jobs` and uses database leases for worker recovery.

Both modes require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when enabled.
Apply the migrations in `supabase/migrations/` before using either Supabase
adapter. The Supabase service-role key is server-only and must never be sent to
clients, browsers or consumer projects. The `email_gateway` schema and tables
must remain inaccessible to `anon` and `authenticated` users.

## Architecture rules
1. Keep HTTP, application, template and provider concerns separated.
2. Client projects must never send SMTP credentials, raw HTML or arbitrary `from` addresses.
3. A project API key determines the project and sender configuration.
4. Templates must validate their own payload with Zod.
5. SMTP credentials stay in environment variables only.
6. `EmailProvider` must remain provider-agnostic so Resend/SES/Brevo can be added later.
7. `EmailDeliveryStore` and `EmailJobQueue` must remain ports so memory and
   Supabase adapters can be replaced without changing the HTTP contract or
   application use cases.
8. Supabase is used only for durable delivery state and job orchestration; do
   not add Supabase Auth, Storage, Realtime or client-side database access
   without a concrete requirement.
9. Do not add infrastructure unless a concrete requirement needs it.

## Verification before completing changes
Run:
- `npm run typecheck`
- `npm test`
- `npm run build`

Add or update tests for behavior changes.
Do not log SMTP passwords, API keys, raw HTML or full recipient addresses.
