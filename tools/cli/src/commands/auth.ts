// @enbi/cli — `enbi auth setup <provider>`: print a ready-to-paste auth config
// snippet and seed .env.example. Does NOT mutate enbi.config.ts (ADR-0039).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EnbiError } from "@enbi/db";

export type AuthProviderName = "github" | "google" | "oidc";
export type AuthSetupResult = { snippet: string; envKeys: string[] };

const SOCIAL = (name: "github" | "google"): AuthSetupResult => {
  const up = name.toUpperCase();
  return {
    envKeys: [`${up}_CLIENT_ID`, `${up}_CLIENT_SECRET`],
    snippet: `auth: {
  // ...
  social: {
    ${name}: {
      clientId: process.env.${up}_CLIENT_ID!,
      clientSecret: process.env.${up}_CLIENT_SECRET!,
    },
  },
}`,
  };
};

const OIDC: AuthSetupResult = {
  envKeys: ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_DISCOVERY_URL"],
  snippet: `auth: {
  // ...
  ssoProviders: [
    {
      providerId: "oidc",
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!,
      discoveryUrl: process.env.OIDC_DISCOVERY_URL!,
    },
  ],
}`,
};

function resultFor(provider: string): AuthSetupResult {
  if (provider === "github" || provider === "google") return SOCIAL(provider);
  if (provider === "oidc") return OIDC;
  throw new EnbiError(
    "validation",
    `Unknown auth provider "${provider}". Use github, google, or oidc.`,
  );
}

export async function runAuthSetup(
  provider: string,
  opts: { cwd?: string; force?: boolean } = {},
): Promise<AuthSetupResult> {
  const result = resultFor(provider);
  const cwd = opts.cwd ?? process.cwd();
  const file = join(cwd, ".env.example");
  const lines = result.envKeys.map((k) => `${k}=`);

  if (!existsSync(file) || opts.force) {
    writeFileSync(file, `${lines.join("\n")}\n`);
  } else {
    const current = readFileSync(file, "utf8");
    const missing = result.envKeys.filter((k) => !current.includes(`${k}=`));
    if (missing.length) appendFileSync(file, `${missing.map((k) => `${k}=`).join("\n")}\n`);
  }

  console.warn(`enbi: add this to your enbi.config.ts:\n\n${result.snippet}\n`);
  console.warn(`enbi: set these in your environment: ${result.envKeys.join(", ")}`);
  return Promise.resolve(result);
}
