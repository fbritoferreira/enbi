// @enbi/db — typed domain errors mapped to HTTP status codes.
export type EnbiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "config"
  | "too_large"
  | "unsupported_media";

const STATUS: Record<EnbiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  config: 500,
  too_large: 413,
  unsupported_media: 415,
};

export class EnbiError extends Error {
  readonly code: EnbiErrorCode;
  readonly status: number;

  constructor(code: EnbiErrorCode, message: string) {
    super(message);
    this.name = "EnbiError";
    this.code = code;
    this.status = STATUS[code];
  }
}
