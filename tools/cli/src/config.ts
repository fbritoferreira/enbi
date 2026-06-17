// @enbi/cli — load the user's enbi.config.ts at runtime with jiti (ADR-0027).
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { type EnbiConfig, EnbiError } from "@enbi/db";
import { createJiti } from "jiti";

const CONFIG_NAMES = ["enbi.config.ts", "enbi.config.js", "enbi.config.mjs"];

export function resolveConfigPath(cwd: string, configPath?: string): string {
  if (configPath) {
    const full = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
    if (!existsSync(full)) throw new EnbiError("config", `Config not found: ${full}`);
    return full;
  }
  for (const name of CONFIG_NAMES) {
    const full = resolve(cwd, name);
    if (existsSync(full)) return full;
  }
  throw new EnbiError(
    "config",
    `No enbi config found in ${cwd} (looked for ${CONFIG_NAMES.join(", ")}).`,
  );
}

function isEnbiConfig(value: unknown): value is EnbiConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.db === "object" &&
    c.db !== null &&
    typeof c.auth === "object" &&
    c.auth !== null &&
    typeof c.roles === "object" &&
    c.roles !== null &&
    Array.isArray(c.collections)
  );
}

export async function loadConfig(cwd: string, configPath?: string): Promise<EnbiConfig> {
  const full = resolveConfigPath(cwd, configPath);
  const jiti = createJiti(cwd);
  const mod = await jiti.import<{ default?: unknown }>(full);
  const config = (mod as { default?: unknown }).default ?? mod;
  if (!isEnbiConfig(config)) {
    throw new EnbiError(
      "config",
      `${full} must default-export defineEnbiConfig({ db, auth, roles, collections }).`,
    );
  }
  return config;
}
