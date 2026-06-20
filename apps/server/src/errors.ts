// @enbi/server — map EnbiError (and unknowns) to JSON HTTP responses.
import { EnbiError } from "@enbi/db";
import type { Context } from "hono";
import type { FieldError } from "./validate.ts";

/**
 * Extended EnbiError that carries structured field-level validation errors
 * (ADR-0049). The `details` array is serialized in the HTTP response body.
 */
export class ValidationError extends EnbiError {
  readonly details: FieldError[];

  constructor(message: string, details: FieldError[]) {
    super("validation", message);
    this.details = details;
  }
}

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof ValidationError) {
    return c.json(
      { error: err.code, message: err.message, details: err.details },
      err.status as 422,
    );
  }
  if (err instanceof EnbiError) {
    return c.json({ error: err.code, message: err.message }, err.status as 400);
  }
  return c.json({ error: "internal", message: "Internal Server Error" }, 500);
}
