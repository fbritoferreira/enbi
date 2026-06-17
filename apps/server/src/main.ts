// @enbi/server — standalone boot entry. The CLI will load the user's real
// enbi.config.ts in a later sub-project; this boots a minimal demo server.
import { serve } from "@hono/node-server";
import { defineEnbiConfig } from "@enbi/db";
import { createServer } from "./index.ts";

const config = defineEnbiConfig({
  db: { dialect: "sqlite", url: process.env.ENBI_DB_URL ?? ":memory:" },
  auth: {
    secret: process.env.ENBI_SECRET ?? "dev-secret-change-me",
    baseURL: "http://localhost:3000",
  },
  roles: { admin: "*", viewer: "read" },
  collections: [],
});

const port = Number(process.env.PORT ?? 3000);
const app = await createServer(config);
serve({ fetch: app.fetch, port });
console.warn(`@enbi/server listening on :${port}`);
