# API Contract

## GET /health

Basic process health check. It does not contact SMTP.

```json
{
  "status": "ok"
}
```

## GET /ready

Readiness check returned once the application has started with valid
configuration. It does not contact SMTP.

```json
{
  "status": "ready"
}
```

## POST /v1/emails

Authentication:

```http
Authorization: Bearer <project-api-key>
# or: Idempotency-Key: <stable-key>
```

Request:

```json
{
  "template": "welcome-user",
  "to": "recipient@example.com",
  "data": {
    "name": "Neto",
    "actionUrl": "https://example.com"
  },
  "idempotencyKey": "welcome-user:user-123"
}
```

Successful response:

```json
{
  "id": "email_<uuid>",
  "status": "accepted",
  "messageId": "<smtp-message-id>",
  "template": "welcome-user"
}
```

Duplicate response:

```json
{
  "id": "email_<uuid>",
  "status": "duplicate",
  "messageId": "<smtp-message-id>",
  "template": "welcome-user"
}
```

## POST /v1/emails/preview

Requires both the administrator session cookie and a project API key. It
validates and renders a template without sending or reserving idempotency.

```json
{
  "template": "welcome-user",
  "data": {
    "name": "Neto",
    "actionUrl": "https://example.com"
  }
}
```

Returns rendered HTML with the subject in `X-Email-Subject`.

The preview workspace also exposes a bottom test-send action and a recent
delivery list. Both use this same Fastify server.

## GET /v1/emails/:id

Requires the project API key that created the delivery. Returns the delivery
record and its current status (`processing`, `accepted`, or `failed`). A
delivery from another project is returned as `404`.

## GET /admin/emails

Requires the administrator session cookie. Returns the latest delivery records
for the protected preview workspace. Recipient addresses are masked.

## Delivery persistence

The default `DELIVERY_STORE=memory` adapter is suitable for local development.
Set `DELIVERY_STORE=supabase` and configure the server-only Supabase URL and
service-role key to use durable records. The migration is stored at
`supabase/migrations/20260808120000_create_email_gateway_deliveries.sql`.

## Rate limiting

Authenticated `/v1/emails` and `/v1/emails/preview` requests are limited per
project. The default is 60 requests per 60 seconds and can be configured with
`RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_SECONDS`. Exceeded limits
return `429` and a `Retry-After` header.

## POST /admin/login

Accepts the administrator credentials from the environment and returns an
HttpOnly session cookie. Failed attempts are rate-limited by source IP.

## GET /v1/projects/me

Requires the administrator session cookie and a project API key. Returns the
resolved project ID, configured sender address, and allowed template names.

Errors:

- `400`: invalid request/template/template data
- `401`: missing/invalid API key
- `403`: template is not allowed for the authenticated project
- `502`: SMTP/provider rejected or failed the operation
- `409`: idempotency key was reused with a different payload
- `500`: unexpected internal error

## Contract rule

Do not extend the public API with:
- SMTP credentials;
- `from`;
- provider name;
- raw HTML.

Those belong to the gateway.
