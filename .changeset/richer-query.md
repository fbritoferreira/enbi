---
"@enbi/server": minor
---

Add richer filter operators, OR match mode, and keyset cursor pagination to the collection list endpoint. `GET /api/<collection>` now accepts operator suffixes on filter keys (`field__like`, `field__gte`, `field__ne`, `field__in`, etc.), a `_match=any` parameter to combine filters with OR semantics, and a `cursor=<pk>` parameter for keyset pagination that returns `X-Next-Cursor` on full pages. Offset pagination and plain `?field=value` equality filters remain fully backward-compatible.
