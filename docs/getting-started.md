# Getting Started with enbi

enbi is a framework-distributed headless CMS. You install it as packages into your project — your repo holds only your database config, content types, and auth config. The framework is delivered entirely through npm.

## 1. Install

```bash
pnpm add @enbi/cli @enbi/db @enbi/server @enbi/admin drizzle-orm @libsql/client
```

## 2. Define your config

Create `enbi.config.ts` in your project root:

```ts
import { collection, defineEnbiConfig } from "@enbi/db";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Define your content model with drizzle.
const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  views: integer("views").notNull().default(0),
});

export default defineEnbiConfig({
  db: {
    dialect: "sqlite",
    url: "file:./enbi.db",
  },
  auth: {
    secret: process.env.ENBI_SECRET!, // at least 32 characters
    baseURL: process.env.ENBI_BASE_URL ?? "http://localhost:3787",
  },
  roles: {
    admin: "*",
    editor: "write",
    viewer: "read",
  },
  collections: [
    collection(articles, {
      name: "articles",
      title: "title",
      versioned: true, // full revision history
      public: ["read"], // unauthenticated read
    }),
  ],
});
```

## 3. Generate and run migrations

```bash
# Write a versioned migration from your schema.
pnpm enbi generate

# Apply pending migrations to your database.
pnpm enbi migrate

# Start the content API + admin UI (auto-syncs schema in dev).
pnpm enbi dev
```

Your content API is now live at `http://localhost:3787/api/articles` and the admin UI at `http://localhost:4321`.

## 4. Create the first admin

The first user who signs up becomes the bootstrap admin. You can do this through the admin UI at `http://localhost:4321` (click "Sign up"), or from the CLI:

```bash
pnpm enbi user create admin@example.com "my-secure-password"
```

Pass `--role admin` if you want to force the admin role regardless of signup order:

```bash
pnpm enbi user create alice@example.com "my-secure-password" --role admin --name "Alice"
```

Promote an existing user:

```bash
pnpm enbi user set-role alice@example.com admin
```

## 5. Mint an API key (for server-to-server access)

```bash
pnpm enbi keys create --role admin --label ci
# Prints the key once — store it immediately.
```

Send `x-api-key: <key>` (or `Authorization: Bearer <key>`) with any request.

## Content API

Each collection is served under `/api/<name>`:

| Method | Path                | Description                                                    |
| ------ | ------------------- | -------------------------------------------------------------- |
| GET    | `/api/articles`     | List (supports `?limit`, `?offset`, `?sort`, `?field__gte`, …) |
| POST   | `/api/articles`     | Create                                                         |
| GET    | `/api/articles/:id` | Read                                                           |
| PATCH  | `/api/articles/:id` | Update                                                         |
| DELETE | `/api/articles/:id` | Delete                                                         |

Revision history: `GET /api/articles/:id/revisions` → list, `GET /api/articles/:id/revisions/:rev` → restore.

## Feature highlights

- **Collections** — model content types in drizzle; Postgres, SQLite, and MySQL supported.
- **Drafts** — mark a collection as `versioned: true`; every save is snapshotted.
- **Scheduled publishing** — set a `publish_at` column; rows are invisible to public readers until the date passes, no background job needed.
- **i18n** — locale variants stored alongside the canonical row.
- **Relations** — link collections; the API resolves them on read.
- **Validation** — per-field rules enforced at write time before the row is stored.
- **WYSIWYG widget** — rich-text editing in the admin UI (block-based, outputs HTML).
- **Media** — upload images/files; stored on disk or an S3-compatible backend.
- **Webhooks** — fire on create/update/delete per collection.
- **API keys** — opaque bearer tokens with per-key roles; only the SHA-256 hash is stored.
- **RBAC** — role-based access control across all content operations and API key issuance.
- **Auth via better-auth** — email/password, GitHub, Google, and generic OIDC/SSO.

## Production

```bash
pnpm enbi build     # build the admin UI for production
pnpm enbi start     # start the production server (reads ENBI_SECRET, DATABASE_URL, …)
```

Set `ENBI_SECRET` (32+ chars) and your database URL in your environment before starting.

## Further reading

- [Architecture Decision Records](./adr/README.md) — the reasoning behind every design choice.
- [Drizzle ORM](https://orm.drizzle.team) — the query builder enbi is built on.
- [better-auth](https://better-auth.com) — the auth library powering sessions and SSO.
