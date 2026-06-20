# 47. Outbound webhooks on content mutations

- Status: Accepted
- Date: 2026-06-20

## Context

Integrators building on enbi frequently need to react to content changes in
real time — rebuilding static sites, invalidating CDN caches, triggering
indexing pipelines, or notifying external systems. Before this decision:

- **No built-in notification mechanism** — consumers had to poll the REST API
  at a fixed interval or wrap enbi's server in custom middleware to observe
  mutations.
- **No standard payload shape** — there was no agreed-upon event envelope,
  forcing each integration to re-implement its own change-detection logic.
- **No security** — there was no way for a receiver to verify that a delivery
  came from a trusted enbi instance.

## Decision

### Configuration

`WebhookConfig` is added to `@enbi/db`'s `config.ts`:

```typescript
export type WebhookEvent = "create" | "update" | "delete";

export type WebhookConfig = {
  url: string;
  events?: WebhookEvent[]; // default: all three
  collections?: string[]; // default: all collections
  secret?: string; // when set, sign the body with HMAC-SHA256
};
```

`EnbiConfig` gains an optional `webhooks?: WebhookConfig[]` field. Multiple
endpoints are supported; each is evaluated independently against its filters.

### Payload

Every delivery carries a `WebhookPayload`:

```typescript
type WebhookPayload = {
  event: WebhookEvent;
  collection: string;
  id: string;
  data: unknown; // the row for create/update; { id } for delete
  timestamp: string; // ISO-8601 UTC
};
```

The body is `JSON.stringify(payload)` with `Content-Type: application/json`.

### Filtering

Each `WebhookConfig` entry filters deliveries in two independent dimensions:

- **Event filter** (`events`): only deliver when the mutation event matches one
  of the listed events. Defaults to all three (`create`, `update`, `delete`).
- **Collection filter** (`collections`): only deliver when the mutated
  collection's name appears in the list. Defaults to all collections.

Both filters are AND-ed together.

### Signing

When `secret` is set, the delivery includes the header:

```
X-Enbi-Signature: sha256=<hmac-sha256-hex>
```

The HMAC is computed over the raw JSON body (`JSON.stringify(payload)`)
using the secret as the key. Receivers verify by computing the same HMAC
and comparing with a constant-time equality check.

Deliveries without a `secret` carry no `X-Enbi-Signature` header.

### Transport

The emitter follows a **fire-and-forget** pattern:

- `emit` is synchronous dispatch — it filters, signs, and calls the sink.
- The default sink calls `fetch(url, { method: "POST", … })` without `await`.
  Network errors are caught by a `.catch` handler that logs a warning via
  `console.warn`. The error is never re-thrown into the request path.
- There are no retries, no delivery log, no queue, and no backpressure.
  This is intentional (see Non-goals below).

### Wiring

`createServer` builds the emitter from `config.webhooks` and a sink (defaulting
to the real `fetch`-based sink). A `webhookSink` option on `CreateServerOptions`
allows tests to inject a synchronous in-memory sink.

`mountCollection` calls `emit` after each successful mutation:

- **POST** — after `insertRow` and the version snapshot succeed.
- **PUT** — after `updateRow` and the version snapshot succeed; data is the
  full updated row.
- **DELETE** — after `deleteRow` succeeds; data is `{ id }` (the row is gone).

Emit is called **after** the mutation succeeds and does **not** block the HTTP
response. The sink runs asynchronously; the caller receives the response without
waiting for webhook delivery.

## Consequences

- **Good:** integrators get immediate change notifications without polling.
- **Good:** event and collection filtering keep traffic proportional — high-write
  collections can be excluded from low-bandwidth endpoints.
- **Good:** optional HMAC-SHA256 signing lets receivers verify authenticity
  without shared session state.
- **Good:** the injectable sink makes testing deterministic — no real network
  calls needed in tests.
- **Good:** zero impact on response latency — delivery is fire-and-forget.
- **Bad:** best-effort only — a network failure silently drops a delivery.
  Operators who need guaranteed delivery must front enbi with a reliable queue.

## Non-goals

- **Retries and backoff** — transient failures are not retried. A persistent
  queue is out of scope for the core package.
- **Delivery log** — there is no UI or API surface for inspecting past
  deliveries or replay.
- **Inbound webhooks** — receiving external events is not addressed here.
- **Per-field events** — granular field-level change detection is not provided;
  consumers receive the full row on create and update.
- **Synchronous delivery** — blocking the HTTP response until the receiver
  acknowledges is not supported.
