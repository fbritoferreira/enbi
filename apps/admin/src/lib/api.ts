// Browser-side fetch helper for the admin. All requests carry the session cookie
// (credentials: include) to the configured enbi server origin.
export function apiBase(): string {
  // import.meta.env is replaced at build; PUBLIC_ vars are exposed to the client.
  return (import.meta.env.PUBLIC_ENBI_API as string | undefined) ?? "http://localhost:3000";
}

export async function enbiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
}
