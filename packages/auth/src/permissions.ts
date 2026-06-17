// @enbi/auth — pure RBAC decision logic (ADR-0017).
import type { PermissionAction, RolePermission } from "@enbi/db";

export type RolesConfig = Record<string, RolePermission>;

export type CanOptions = {
  /**
   * Whether the `"read"` role shorthand (read any collection) applies. Disable
   * for sensitive system resources like `keys`, which only `"*"` or an explicit
   * per-resource grant may access (ADR-0034).
   */
  allowReadShorthand?: boolean;
};

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
  options: CanOptions = {},
): boolean {
  if (!roleName) return false;
  const permission = roles[roleName];
  if (permission === undefined) return false;
  if (permission === "*") return true;
  if (permission === "read") return (options.allowReadShorthand ?? true) && action === "read";
  return permission[collection]?.includes(action) ?? false;
}
