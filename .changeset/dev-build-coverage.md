---
"@enbi/cli": patch
---

`enbi dev` and `startAdminDev` now return closable handles (`DevHandle` / `AdminHandle`), so the dev server and admin can be stopped programmatically. No change to the `dev`/`build` CLI behavior.
