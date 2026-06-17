# @enbi/db

The database/config surface for [enbi](https://enbi-cms.com). Define your content types as Drizzle
tables, register them with `collection()`, and `defineEnbiConfig()` ties together db + auth + roles

- collections.

```ts
import { collection, defineEnbiConfig } from "@enbi/db";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const posts = sqliteTable("posts", { id: text("id").primaryKey(), title: text("title").notNull() });

export default defineEnbiConfig({
  db: { dialect: "sqlite", url: "file:./enbi.db" },
  auth: { secret: process.env.ENBI_SECRET! },
  roles: { admin: "*", viewer: "read" },
  collections: [collection(posts, { name: "posts", title: "title", versioned: true })],
});
```

Provides `createDb` (Postgres / SQLite / MySQL), the generic `_revisions` and `_api_keys` tables,
`buildSchema` (migration aggregation), and the typed `EnbiError`. Part of the enbi framework — see
the [repo](https://github.com/fbritoferreira/enbi). GPL-2.0-only.
