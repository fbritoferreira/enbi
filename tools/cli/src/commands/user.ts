// @enbi/cli — `enbi user create` / `enbi user set-role`: CLI user management (ADR-0053).
import { createDb, EnbiError } from "@enbi/db";
import { AUTH_BASE_PATH, authSchema, createAuth } from "@enbi/auth";
import { sql } from "drizzle-orm";
import { loadConfig } from "../config.ts";

export type UserCreateOptions = {
  cwd?: string;
  config?: string;
  role?: string;
  name?: string;
};

export type UserSetRoleOptions = {
  cwd?: string;
  config?: string;
};

/**
 * Create a user by routing through the better-auth sign-up handler so the
 * password is hashed correctly (bcrypt via better-auth's internal pipeline).
 * If `opts.role` is provided, the role is set directly via drizzle after creation
 * (the better-auth handler itself only accepts email/password/name).
 */
export async function runUserCreate(
  email: string,
  password: string,
  opts: UserCreateOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);
  const ctx = await createDb(config.db);
  const auth = createAuth(ctx, config.auth);

  // Build the sign-up request — identical to what the admin or tests do.
  const baseURL = config.auth.baseURL ?? "http://localhost";
  const origin = new URL(baseURL).origin;
  const request = new Request(`${origin}${AUTH_BASE_PATH}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password, name: opts.name ?? email }),
  });

  const response = await auth.handler(request);
  if (!response.ok) {
    const text = await response.text();
    throw new EnbiError("validation", `Failed to create user (${response.status}): ${text}`);
  }

  // If an explicit role was requested, apply it directly (overrides bootstrap logic).
  if (opts.role) {
    const userTable = authSchema(config.auth, ctx.dialect).user;
    await ctx.db
      .update(userTable as never)
      .set({ role: opts.role } as never)
      .where(sql`email = ${email}`);
    console.warn(`enbi: created user <${email}> with role "${opts.role}".`);
  } else {
    console.warn(`enbi: created user <${email}> (role assigned by bootstrap logic).`);
  }
}

/**
 * Update an existing user's role directly via drizzle. Throws `not_found` when
 * no user with the given email exists.
 */
export async function runUserSetRole(
  email: string,
  role: string,
  opts: UserSetRoleOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);
  const ctx = await createDb(config.db);

  const userTable = authSchema(config.auth, ctx.dialect).user;

  // Fetch first so we know if the user exists before updating.
  const existing = (await ctx.db
    .select({ id: sql<string>`id` })
    .from(userTable as never)
    .where(sql`email = ${email}`)
    .limit(1)) as Array<{ id: string }>;

  if (existing.length === 0) {
    throw new EnbiError("not_found", `No user with email "${email}".`);
  }

  await ctx.db
    .update(userTable as never)
    .set({ role } as never)
    .where(sql`email = ${email}`);

  console.warn(`enbi: set role of <${email}> to "${role}".`);
}
