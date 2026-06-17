// @enbi/server — Hono content API factory. Routes land in later sub-projects.
import { Hono } from "hono";

export function createServer(): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  return app;
}
