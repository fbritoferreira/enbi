---
"@enbi/db": minor
"@enbi/server": minor
---

Add outbound webhooks on content mutations: configure endpoints via `webhooks` in `EnbiConfig`; filter by event type and collection; optional HMAC-SHA256 signing via `X-Enbi-Signature`; fire-and-forget delivery that never blocks the request path.
