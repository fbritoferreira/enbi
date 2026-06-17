# @enbi/core

The content-history / versioning engine for [enbi](https://enbi-cms.com). Every save writes a full
row snapshot to the generic `_revisions` table; entries can be listed, fetched, and restored.

```ts
import { writeRevision, listRevisions, restoreRevision } from "@enbi/core";

await writeRevision(db, revisions, { collection: "posts", entryId: "p1", data, authorId });
const history = await listRevisions(db, revisions, { collection: "posts", entryId: "p1" });
const old = await restoreRevision(db, revisions, {
  collection: "posts",
  entryId: "p1",
  version: 1,
});
```

Pure functions over Drizzle — no HTTP, no auth. Part of the enbi framework — see the
[repo](https://github.com/fbritoferreira/enbi). GPL-2.0-only.
