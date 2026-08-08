# Email Gateway

Small internal service for centralizing transactional email delivery across projects.

The gateway is the source of truth for templates, sender policy, project authentication, and delivery orchestration. Consumer projects provide only a template, its data, a recipient, and optionally an idempotency key.

Consumer projects never provide SMTP credentials, a provider, a `from` address, raw HTML, or arbitrary email content.

For idempotent requests, prefer the standard header:

```http
Idempotency-Key: welcome-user:user-123
```

The legacy `idempotencyKey` JSON field is also accepted. If both are sent,
they must contain the same value. Reusing a key with a different template,
recipient or data payload returns `409`.

## Scope

The MVP includes:

- Node.js 22+, TypeScript, and Fastify;
- React Email templates stored in Git;
- Zod validation per template;
- project-scoped API keys;
- Nodemailer SMTP delivery;
- authenticated and unauthenticated SMTP;
- in-memory delivery records and idempotency with a 24-hour TTL;
- an authenticated HTML preview API;
- a visual preview workspace at `/preview`;
- a Mailpit development environment;
- Vitest tests.

It intentionally does not include a durable database, queue, worker, retry system, dashboard, or alternate provider. Delivery records are currently ephemeral and are lost on restart.

## Architecture

```text
Consumer project
      |
      | POST /v1/emails + Bearer API key
      v
Fastify HTTP boundary
      |
      v
Authentication and project policy
      |
      v
Template registry + Zod validation
      |
      v
React Email rendering
      |
      v
EmailProvider interface
      |
      v
SmtpEmailProvider / Nodemailer
      |
      v
SMTP server or Mailpit
```

Application code depends on the provider-agnostic `EmailProvider` interface rather than Nodemailer. This leaves room for future provider adapters without changing the consumer API.

Delivery persistence follows the same boundary. `EmailDeliveryStore` is the
port used by the application, and `InMemoryEmailDeliveryStore` is the current
adapter. A future Oracle, Supabase or MySQL adapter can replace it without
changing the HTTP routes or services.

The repository also includes a Supabase adapter and migration. The selected
adapter is controlled by environment variables:

```env
DELIVERY_STORE=memory
```

For durable delivery history and restart-safe idempotency:

```env
DELIVERY_STORE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

Apply [`supabase/migrations/20260808120000_create_email_gateway_deliveries.sql`](supabase/migrations/20260808120000_create_email_gateway_deliveries.sql)
in the Supabase SQL Editor or through the Supabase migration workflow. The
`email_gateway` schema is intentionally server-side only. If the project uses
the Supabase Data API, expose this schema in its Data API settings while
keeping grants for `anon` and `authenticated` revoked. Never expose the
service-role key to a browser or consumer project.

## Installation

Requirements:

- Node.js 22 or newer;
- Docker, if you want to run Mailpit locally.

Install dependencies:

```bash
npm install
```

For Purelymail or staging, copy the environment template and configure it:

```bash
cp .env.example .env
```

Local Mailpit configuration lives separately in `.env.local`. The default
`npm run dev` uses `.env.local`; to run the gateway against the Purelymail
configuration instead, use:

```bash
npm run dev:purelymail
```

The real `.env` and `.env.local` files are intentionally ignored by Git. For
local development, create `.env.local` from
[`.env.local.example`](.env.local.example). For a server deployment, inject
`.env` or the equivalent environment variables through the hosting platform;
do not upload the secret file as part of the source code.

Docker Compose also uses `.env.local` and overrides the SMTP hostname inside
the container to `mailpit`; host-based development uses `localhost`.

Project metadata is kept in [`src/config/project-definitions.ts`](src/config/project-definitions.ts). Secrets and SMTP credentials belong in `.env` or in the deployment environment. `.env` is ignored by Git.

The preview workspace is protected by administrator credentials:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=use-a-long-password
```

These credentials are required at startup. The application creates an
HttpOnly, SameSite session cookie after a successful login. Sessions are kept
in memory and expire after eight hours; restarting the process logs out all
administrators.

## Project configuration

Each project definition contains non-secret metadata:

```ts
{
  id: 'bloom-app',
  envPrefix: 'BLOOM_APP',
  allowedTemplates: ['shared-access-invitation', 'shared-access-permission-updated'],
}
{
  id: 'pontebr',
  envPrefix: 'PONTEBR',
  allowedTemplates: ['*'],
}
```

The configured projects are `bloom-app`, `pontebr`, `blocos-e-bits`, and
`jbqneto`. The Purelymail mailbox names in `.env` are proposed defaults and
must be replaced if those usernames are unavailable or if you use custom
domains.

The prefix maps to environment variables:

```env
BLOOM_APP_API_KEY=at-least-32-random-characters
BLOOM_APP_FROM_EMAIL=bloom@purelymail.com
BLOOM_APP_FROM_NAME=Bloom
BLOOM_APP_SMTP_HOST=smtp.purelymail.com
BLOOM_APP_SMTP_PORT=465
BLOOM_APP_SMTP_SECURE=true
BLOOM_APP_SMTP_AUTH=true
BLOOM_APP_SMTP_USER=bloom@purelymail.com
BLOOM_APP_SMTP_PASSWORD=app-password
```

API keys must contain at least 32 characters. The application fails during startup when required configuration is missing or invalid, and rejects duplicate project IDs or API keys.

## API rate limiting

Authenticated email and preview requests are rate-limited per project. The
default is 60 requests per 60 seconds:

```env
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60
```

When the limit is reached, the API returns `429` with `Retry-After`,
`RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers. The
current limiter is in memory and therefore applies per process. A future
Redis-backed adapter can replace it without changing the routes.

### SMTP authentication modes

For Purelymail authenticated SMTP:

```env
BLOOM_APP_SMTP_HOST=smtp.purelymail.com
BLOOM_APP_SMTP_PORT=465
BLOOM_APP_SMTP_SECURE=true
BLOOM_APP_SMTP_AUTH=true
BLOOM_APP_SMTP_USER=bloom@purelymail.com
BLOOM_APP_SMTP_PASSWORD=app-password
```

For an SMTP server without authentication, such as Mailpit:

```env
PROJECT_A_SMTP_HOST=localhost
PROJECT_A_SMTP_PORT=1025
PROJECT_A_SMTP_SECURE=false
PROJECT_A_SMTP_AUTH=false
```

When `SMTP_AUTH=false`, the user and password are not configured in Nodemailer. For port 465, use `SMTP_SECURE=true`; for the usual submission port 587, use `SMTP_SECURE=false` unless your provider says otherwise.

## Running the API

Start the gateway:

```bash
npm run dev
```

The API listens on `http://localhost:3000` by default.

Health check:

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "ok"
}
```

Readiness check:

```bash
curl http://localhost:3000/ready
```

`/health` is a basic process check. `/ready` confirms that the HTTP
application has started with its configuration loaded; neither endpoint probes
SMTP.

## Visual preview workspace

The gateway serves a protected visual preview workspace from the same Fastify server:

```text
http://localhost:3000/preview
```

Open `/preview`, sign in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`, and then
the workspace provides:

- project API key input;
- template selection;
- JSON data editing;
- rendered HTML preview;
- a fixed bottom bar with a recipient input and “Send test email” button.

The preview action calls `POST /v1/emails/preview` with both the admin session
cookie and the selected project's API key. The send button calls the real
`POST /v1/emails` endpoint with the project API key, so it exercises the same
authentication, validation, rendering, sender policy, and SMTP path used by
consumer projects.

The page identifies the project behind the entered API key through the
admin-protected `GET /v1/projects/me` endpoint and includes a logout action.
Failed administrator logins are rate-limited per source IP.

No second server is required. The standalone React Email preview command remains available as an optional development tool:

```bash
npm run email:dev
```

## Preview API

```http
POST /v1/emails/preview
Authorization: Bearer <project-api-key>
Content-Type: application/json
```

Request:

```json
{
  "template": "welcome-user",
  "data": {
    "name": "Neto",
    "actionUrl": "https://example.com/activate"
  }
}
```

The response is the rendered HTML with `Content-Type: text/html`. The request
requires the admin session cookie and the project API key. The generated
subject is returned in the `X-Email-Subject` response header. Preview does not
contact SMTP and does not reserve an idempotency key.

Example:

```bash
curl -i -X POST http://localhost:3000/v1/emails/preview \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Cookie: email_gateway_admin=YOUR_ADMIN_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "welcome-user",
    "data": {
      "name": "Neto",
      "actionUrl": "https://example.com/activate"
    }
  }'
```

## Sending email

### `POST /v1/emails`

Authentication:

```http
Authorization: Bearer <project-api-key>
```

Request:

```json
{
  "template": "welcome-user",
  "to": "recipient@example.com",
  "data": {
    "name": "Neto",
    "actionUrl": "https://example.com/activate"
  },
  "idempotencyKey": "welcome-user:user-123"
}
```

`to` accepts either one email address or an array of up to 20 addresses.

Successful response:

```json
{
  "status": "accepted",
  "messageId": "<smtp-message-id>",
  "template": "welcome-user"
}
```

The accepted response uses HTTP `202`. A duplicate idempotency key returns HTTP `200`:

```json
{
  "status": "duplicate",
  "template": "welcome-user"
}
```

Example:

```bash
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "welcome-user",
    "to": "recipient@example.com",
    "idempotencyKey": "welcome-user:user-123",
    "data": {
      "name": "Neto",
      "actionUrl": "https://example.com/activate"
    }
  }'
```

## Templates

Templates live in `emails/` and are version-controlled:

```text
emails/
├── welcome-user.tsx
├── generic-notification.tsx
└── shared-access.tsx
```

The central registry is [`src/templates/template-registry.ts`](src/templates/template-registry.ts). Each entry defines a Zod schema, React Email component, and subject function.

Sample payloads and labels for the visual preview are centralized in
[`src/templates/template-preview-data.ts`](src/templates/template-preview-data.ts).
The `/preview` page is generated from that exported catalog, so adding or
changing preview data does not require editing the page's HTML or JavaScript.

Current templates:

- `welcome-user`: `{ name: string, actionUrl: string }`, subject `Welcome, <name>` in the configured Portuguese template;
- `generic-notification`: `{ title: string, message: string }`, subject equal to `title`.
- `shared-access-invitation`: invitation to a shared Bloom workspace;
- `shared-access-permission-updated`: notification that a shared-access permission changed;
- `shared-access-suspended`: notification that shared access was suspended;
- `shared-access-revoked`: notification that shared access was removed.

The Bloom project currently allows the four `shared-access-*` templates through
its project-specific allowlist. There is no single `shared-access` template name;
the exact names above must be used in API requests.

Schemas are strict. Unknown fields and arbitrary HTML are rejected. To add a template:

1. Create the React Email component in `emails/`.
2. Add its strict Zod schema and subject function to the registry.
3. Add a representative payload and label to `template-preview-data.ts`.
4. Add the name to any project allowlist that needs it.
5. Add tests for valid and invalid data.

## Mailpit local development

The Compose file starts both the gateway and Mailpit:

```bash
docker compose up --build
```

Mailpit endpoints:

- SMTP: `localhost:1025`;
- web UI: `http://localhost:8025`.

For each project running inside Compose, the corresponding prefix from
`.env.local` is overridden to use:

```env
<PROJECT>_SMTP_HOST=mailpit
<PROJECT>_SMTP_PORT=1025
<PROJECT>_SMTP_SECURE=false
<PROJECT>_SMTP_AUTH=false
```

For the gateway running directly on the host with `npm run dev`, use `localhost` instead of `mailpit`. Mailpit accepts and displays messages locally; it does not deliver them to external inboxes.

End-to-end flow:

1. Configure a local API key and `SMTP_AUTH=false`.
2. Run `docker compose up --build`.
3. Open `http://localhost:3000/preview`.
4. Sign in with the admin credentials from `.env.local`.
5. Enter the project API key and template data.
6. Use the bottom bar to send a test email.
7. Inspect the message at `http://localhost:8025`.

## SMTP verification

Verify every configured project:

```bash
npm run smtp:verify
```

This uses `.env` and therefore verifies Purelymail. To verify Mailpit instead:

```bash
npm run smtp:verify:local
```

The command prints only project IDs and `OK`/`FAILED` status. It never prints API keys or SMTP credentials.

## Purelymail setup checklist

1. Create or confirm the four Purelymail mailboxes in `.env`: Bloom, PonteBR,
   Blocos e Bits, and JBQ Neto.
2. If using custom domains, add the MX, SPF, ownership, DKIM, and DMARC DNS
   records shown in Purelymail's domain page.
3. Wait for DNS verification and confirm that MX, SPF, DKIM, and DMARC pass.
4. Enable MFA for each mailbox when appropriate.
5. Create one App Password per mailbox for the gateway.
6. Put those App Passwords in the corresponding `*_SMTP_PASSWORD` variables.
7. Set real project API keys with at least 32 characters.
8. Run `npm run smtp:verify`.
9. Run `npm run dev:purelymail` and send a test from `/preview`, or deploy
   with the same environment variables.

The Purelymail API is optional for this project. It can later automate mailbox
creation, App Password creation, DNS status checks, and routing rules, but
email delivery itself uses SMTP.

## Tests and build

```bash
npm run typecheck
npm test
npm run build
```

The test suite uses a fake provider and does not connect to real SMTP servers.

## Security boundaries

- API keys identify the project and are compared using a timing-safe comparison when lengths match.
- The client cannot choose `from`, SMTP settings, provider, or raw HTML.
- SMTP credentials remain in environment variables.
- Logs contain project ID, template, status, and masked recipients only.
- Errors do not expose stack traces or credentials.

## Current limitations

- Delivery history and idempotency are in memory only and are lost on restart.
- Idempotency is not shared between multiple instances.
- The delivery list is operational history only; it is not durable auditing.
- There are no automatic retries or queues.
- Only SMTP/Nodemailer is implemented.
- The `/preview` page is an internal development tool, not a user-management or dashboard feature.
- Admin sessions are in memory and are not shared across instances.
- The admin login rate limiter is also in memory and should be paired with a
  reverse proxy rate limit when publicly exposed.

## Roadmap

When a concrete requirement appears, the next likely evolution steps are:

1. Replace `InMemoryEmailDeliveryStore` with a durable adapter when multiple instances or restart-safe history are required.
2. Add retention, query filters and operational metrics around delivery records.
3. Add a second `EmailProvider` adapter only when a real provider requirement exists.

Do not add databases, queues, dashboards, alternate providers, or observability infrastructure ahead of those requirements.
