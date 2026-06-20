// @enbi/server — authentication + RBAC gate for a route (ADR-0017, ADR-0019).
import { type AnyCollection, EnbiError, isPublicAction, type PermissionAction } from "@enbi/db";
import { type AuthProvider, can, type CanOptions, type RolesConfig } from "@enbi/auth";

/** Role assigned to anonymous callers (ADR-0019). */
export const PUBLIC_ROLE = "public";

export type Caller = { userId: string | null; role: string };

/**
 * Authorize an action on a collection. Public actions (ADR-0019) bypass auth
 * entirely. Otherwise the caller's role — or `public` when anonymous — must be
 * granted the action in the roles config, or a typed 401/403 is thrown.
 */
/**
 * Authorize an `action` on a named permission resource. The caller's role — or
 * `public` when anonymous — must be granted it, else a typed 401/403 is thrown.
 */
export async function authorizeResource(
  authProvider: AuthProvider,
  roles: RolesConfig,
  resource: string,
  action: PermissionAction,
  headers: Headers,
  options?: CanOptions,
): Promise<Caller> {
  const identity = await authProvider.authenticate(headers).catch(() => null);
  const role = identity?.role ?? PUBLIC_ROLE;
  if (!can(roles, role, resource, action, options)) {
    if (!identity) throw new EnbiError("unauthorized", "Authentication required.");
    throw new EnbiError("forbidden", `Role "${role}" cannot ${action} "${resource}".`);
  }
  return { userId: identity?.userId ?? null, role };
}

export async function authorize(
  authProvider: AuthProvider,
  roles: RolesConfig,
  collection: AnyCollection,
  action: PermissionAction,
  headers: Headers,
): Promise<Caller> {
  if (isPublicAction(collection.public, action)) {
    // Even on public actions, identify the caller so draft filtering knows
    // whether they are truly anonymous or an authenticated admin (ADR-0045).
    // A failing auth provider is treated as anonymous (no identity) so public
    // reads remain available even when the provider is temporarily unavailable.
    const identity = await authProvider.authenticate(headers).catch(() => null);
    return { userId: identity?.userId ?? null, role: identity?.role ?? PUBLIC_ROLE };
  }
  return authorizeResource(authProvider, roles, collection.permissionsKey, action, headers);
}
