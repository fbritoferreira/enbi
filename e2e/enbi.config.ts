// e2e fixture config — a tiny enbi project the Playwright suite boots via the CLI.
import { collection, defineEnbiConfig } from "@enbi/db";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  views: integer("views").notNull().default(0),
});

export default defineEnbiConfig({
  db: { dialect: "sqlite", url: "file:e2e/.tmp/e2e.db" },
  auth: {
    secret: "e2e-secret-at-least-32-characters-long-xx",
    baseURL: "http://localhost:3787",
  },
  roles: { admin: "*", viewer: "read" },
  collections: [collection(posts, { name: "posts" })],
});
