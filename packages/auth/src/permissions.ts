// @enbi/auth — pure RBAC decision logic (ADR-0017).
import type { PermissionAction, RolePermission } from "@enbi/db";

export type RolesConfig = Record<string, RolePermission>;

/**
 * Decide whether `roleName` may perform `action` on `collection`, given the
 * project's roles config. A role is `"*"` (all), `"read"` (read any), or an
 * explicit per-collection action map. Unknown role / missing entry → denied.
 */
export function can(
  roles: RolesConfig,
  roleName: string | null | undefined,
  collection: string,
  action: PermissionAction,
): boolean {
  if (!roleName) return false;
  const permission = roles[roleName];
  if (permission === undefined) return false;
  if (permission === "*") return true;
  if (permission === "read") return action === "read";
  return permission[collection]?.includes(action) ?? false;
}
