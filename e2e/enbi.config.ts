// e2e fixture config — a tiny enbi project the Playwright suite boots via the CLI.
import { collection, defineEnbiConfig } from "@enbi/db";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  views: integer("views").notNull().default(0),
});

// The mock OIDC provider is only present when globalSetup booted its container
// (CI / Docker). Locally (no Docker) it is omitted and the server boots without SSO.
const ssoProviders = process.env.ENBI_E2E_SSO_DISCOVERY
  ? [
      {
        providerId: "mock",
        clientId: "enbi-e2e",
        clientSecret: "enbi-e2e-secret",
        discoveryUrl: process.env.ENBI_E2E_SSO_DISCOVERY,
      },
    ]
  : undefined;

export default defineEnbiConfig({
  db: { dialect: "sqlite", url: "file:e2e/.tmp/e2e.db" },
  auth: {
    secret: "e2e-secret-at-least-32-characters-long-xx",
    baseURL: "http://localhost:3787",
    ...(ssoProviders ? { ssoProviders } : {}),
  },
  roles: { admin: "*", viewer: "read" },
  collections: [collection(posts, { name: "posts", title: "title", versioned: true })],
  admin: process.env.ENBI_E2E_ADMIN_ORIGIN
    ? { origin: process.env.ENBI_E2E_ADMIN_ORIGIN }
    : undefined,
});
