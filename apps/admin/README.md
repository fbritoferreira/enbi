# @enbi/admin

The Astro admin UI for [enbi](https://enbi-cms.com). It talks to the `@enbi/server` content API over
HTTP only (no build-time coupling to the server/db). The `enbi` CLI runs it (`enbi dev`) and builds
it (`enbi build`) via Astro's programmatic API.

Status: scaffold. The full admin (better-auth login, per-collection list/create/edit, revision
history + restore) is an upcoming sub-project. Part of the enbi framework — see the
[repo](https://github.com/fbritoferreira/enbi). GPL-2.0-only.
