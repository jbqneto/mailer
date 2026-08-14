# API Contract

## GET /health

Basic process health check. It does not contact SMTP.

```json
{
  "status": "ok"
}
```

## GET /metrics

Returns aggregated Prometheus-compatible metrics for HTTP requests and email
delivery results. Labels contain only method, route, status code and delivery
status; recipients, subjects, payloads and credentials are never included.

## SMTP retry policy

Transient connection errors, timeouts and SMTP 4xx responses are retried with
exponential backoff. Configure the maximum attempts and initial delay with
`SMTP_MAX_ATTEMPTS` and `SMTP_RETRY_DELAY_MS`. Permanent SMTP 5xx responses are
not retried.

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

With the production queue enabled, a newly accepted request returns
`status: "queued"` and `202`. The delivery ID can be used with
`GET /v1/emails/:id`; its status changes from `processing` to `accepted` or
`failed` when the background worker finishes.

Duplicate response:

```json
{
  "id": "email_<uuid>",
  "status": "duplicate",
  "messageId": "<smtp-message-id>",
  "template": "welcome-user"
}
```

When a request with the same idempotency key is still being delivered, the
gateway returns `202` with `status: "processing"` and the original delivery
ID. It does not send a second message. If the original delivery failed, the
same key remains reserved and subsequent requests return `502` with the
delivery ID; use a new business event/idempotency key only after deciding how
to handle that failed or provider-ambiguous delivery.

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

For a durable worker queue, also set `QUEUE_STORE=supabase` and apply
`supabase/migrations/20260809010000_create_email_gateway_jobs.sql`. The queue
uses database leases to reclaim jobs whose worker stopped before completing.

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
