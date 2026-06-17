// @enbi/auth — auth is injected into the server behind this interface, so the
// content/RBAC layer is testable without booting a real auth backend.
export type Identity = {
  userId: string;
  role: string | null;
};

export type AuthProvider = {
  /** Resolve the caller's identity from request headers, or null if anonymous. */
  authenticate(headers: Headers): Promise<Identity | null>;
};
