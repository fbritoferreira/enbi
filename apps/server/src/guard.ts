// @enbi/server — authentication + RBAC gate for a route (ADR-0017, ADR-0019).
import { type AnyCollection, EnbiError, isPublicAction, type PermissionAction } from "@enbi/db";
import { type AuthProvider, can, type RolesConfig } from "@enbi/auth";

/** Role assigned to anonymous callers (ADR-0019). */
export const PUBLIC_ROLE = "public";

export type Caller = { userId: string | null; role: string };

/**
 * Authorize an action on a collection. Public actions (ADR-0019) bypass auth
 * entirely. Otherwise the caller's role — or `public` when anonymous — must be
 * granted the action in the roles config, or a typed 401/403 is thrown.
 */
export async function authorize(
  authProvider: AuthProvider,
  roles: RolesConfig,
  collection: AnyCollection,
  action: PermissionAction,
  headers: Headers,
): Promise<Caller> {
  if (isPublicAction(collection.public, action)) {
    return { userId: null, role: PUBLIC_ROLE };
  }
  const identity = await authProvider.authenticate(headers);
  const role = identity?.role ?? PUBLIC_ROLE;
  if (!can(roles, role, collection.permissionsKey, action)) {
    if (!identity) throw new EnbiError("unauthorized", "Authentication required.");
    throw new EnbiError(
      "forbidden",
      `Role "${role}" cannot ${action} "${collection.permissionsKey}".`,
    );
  }
  return { userId: identity?.userId ?? null, role };
}
