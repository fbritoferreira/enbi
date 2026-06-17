// @enbi/cli — `enbi keys <action> [id]`: mint / list / revoke API keys.
import { createDb, EnbiError } from "@enbi/db";
import { issueApiKey, listApiKeys, revokeApiKey } from "@enbi/auth";
import { loadConfig } from "../config.ts";

export type KeysOptions = {
  cwd?: string;
  config?: string;
  role?: string;
  label?: string;
};

export async function runKeys(
  action: string,
  id: string | undefined,
  opts: KeysOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);
  const ctx = await createDb(config.db);

  switch (action) {
    case "create": {
      const role = opts.role ?? "viewer";
      if (!(role in config.roles)) {
        console.warn(`enbi: warning — role "${role}" is not defined in enbi.config.ts roles.`);
      }
      const { id: keyId, key } = await issueApiKey(ctx.db, ctx.apiKeys, {
        role,
        label: opts.label,
      });
      console.warn(`enbi: created API key ${keyId} (role: ${role}). Store it now — shown once:`);
      console.warn(key);
      return;
    }
    case "list": {
      const keys = await listApiKeys(ctx.db, ctx.apiKeys);
      if (keys.length === 0) {
        console.warn("enbi: no API keys.");
        return;
      }
      for (const k of keys) {
        console.warn(`${k.id}  role=${k.role}  label=${k.label ?? "-"}  created=${k.createdAt}`);
      }
      return;
    }
    case "revoke": {
      if (!id) throw new EnbiError("validation", "Usage: enbi keys revoke <id>");
      const removed = await revokeApiKey(ctx.db, ctx.apiKeys, id);
      console.warn(removed ? `enbi: revoked ${id}.` : `enbi: no key with id ${id}.`);
      return;
    }
    default:
      throw new EnbiError("validation", `Unknown keys action "${action}" (create|list|revoke).`);
  }
}
