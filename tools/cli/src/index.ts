// @enbi/cli — command surface (ADR-0009 fulfilled): dev / build / start / migrate.
import { cac } from "cac";
import pkg from "../package.json" with { type: "json" };
import { runBuild } from "./commands/build.ts";
import { runDev } from "./commands/dev.ts";
import { runGenerate } from "./commands/generate.ts";
import { runKeys } from "./commands/keys.ts";
import { runMigrate } from "./commands/migrate.ts";
import { runStart } from "./commands/start.ts";

export function getVersion(): string {
  return pkg.version;
}

type CommonFlags = { config?: string; port?: string };

export async function run(argv: string[]): Promise<void> {
  const cli = cac("enbi");

  cli
    .command("dev", "Start the dev server (syncs schema, runs the admin)")
    .option("--config <path>", "Path to enbi.config.ts")
    .option("--port <port>", "Server port")
    .action((flags: CommonFlags) =>
      runDev({ config: flags.config, port: flags.port ? Number(flags.port) : undefined }),
    );

  cli.command("build", "Build the admin for production").action(() => runBuild());

  cli
    .command("start", "Start the production server")
    .option("--config <path>", "Path to enbi.config.ts")
    .option("--port <port>", "Server port")
    .action((flags: CommonFlags) =>
      runStart({ config: flags.config, port: flags.port ? Number(flags.port) : undefined }),
    );

  cli
    .command("generate", "Generate a migration from the current schema")
    .option("--config <path>", "Path to enbi.config.ts")
    .option("--dir <path>", "Migrations directory")
    .option("--name <name>", "Migration name")
    .action((flags: CommonFlags & { dir?: string; name?: string }) =>
      runGenerate({ config: flags.config, dir: flags.dir, name: flags.name }),
    );

  cli
    .command("migrate", "Apply pending migrations")
    .option("--config <path>", "Path to enbi.config.ts")
    .option("--dir <path>", "Migrations directory")
    .action((flags: CommonFlags & { dir?: string }) =>
      runMigrate({ config: flags.config, dir: flags.dir }),
    );

  cli
    .command("keys <action> [id]", "Manage API keys (create | list | revoke <id>)")
    .option("--config <path>", "Path to enbi.config.ts")
    .option("--role <role>", "Role for the new key (create)")
    .option("--label <label>", "Label for the new key (create)")
    .action(
      (
        action: string,
        id: string | undefined,
        flags: CommonFlags & { role?: string; label?: string },
      ) => runKeys(action, id, { config: flags.config, role: flags.role, label: flags.label }),
    );

  cli.help();
  cli.version(getVersion());
  cli.parse(argv, { run: false });
  await cli.runMatchedCommand();
}
