// @enbi/server — map EnbiError (and unknowns) to JSON HTTP responses.
import { EnbiError } from "@enbi/db";
import type { Context } from "hono";

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof EnbiError) {
    return c.json({ error: err.code, message: err.message }, err.status as 400);
  }
  return c.json({ error: "internal", message: "Internal Server Error" }, 500);
}
