# Architecture

## Boundary

The service owns:

- project authentication;
- project -> sender mapping;
- project -> SMTP mapping;
- template source code;
- template data validation;
- rendering;
- idempotency policy;
- delivery orchestration.

The SMTP server owns:

- SMTP acceptance;
- downstream delivery;
- provider-side throttling;
- provider-side reputation.

Consumer projects own:

- business event;
- recipient;
- template selection;
- template data;
- a business-level idempotency key.

## Dependency direction

```text
HTTP route
   |
   v
SendEmailUseCase
   |         \
   v          v
Templates   EmailDeliveryStore
   |
   v
EmailProvider (interface)
   |
   v
SmtpEmailProvider
   |
   v
Nodemailer / SMTP
```

`EmailDeliveryStore` is an asynchronous persistence port. The current
`InMemoryEmailDeliveryStore` keeps delivery records and idempotency mappings in
process memory. A future Oracle, Supabase or MySQL adapter can implement the
`EmailDeliveryStore` is an asynchronous persistence port. The
`InMemoryEmailDeliveryStore` is used by default and keeps delivery records in
process memory with a 24-hour idempotency TTL. `SupabaseEmailDeliveryStore`
uses the private `email_gateway.email_deliveries` table and its unique partial
index on `(project_id, idempotency_key)` to make idempotency safe across
instances. An Oracle or MySQL adapter can implement the same port using its
own transaction and unique constraint, without changing `SendEmailUseCase` or
the HTTP contract.

Application code depends on `EmailProvider`, not on Nodemailer.

## Why no durable database yet?

The V0 requirement is fast, functional and cheap.
A durable database would immediately add schema, migrations, connection
management, backup and deployment concerns. The port exists now so that this
change remains isolated when durable history or multi-instance idempotency is
needed.

Add persistence when there is a concrete need for:
- durable idempotency;
- delivery history;
- auditing;
- retries;
- a dashboard.

## Why templates in Git?

Git remains the source of truth for:
- content;
- code review;
- rollback;
- type-safe props;
- tests;
- provider independence.

A future provider may host templates, but that should be an adapter/optimization,
not the canonical source unless the architecture is intentionally changed.

## Security boundary

Clients authenticate with project-scoped API keys.

Clients cannot select:
- SMTP credentials;
- sender address;
- provider;
- arbitrary HTML.

This prevents one compromised project credential from freely impersonating
another configured sender.
