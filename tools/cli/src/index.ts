// @enbi/cli — command surface (ADR-0009 fulfilled): dev / build / start / migrate.
import { cac } from "cac";
import pkg from "../package.json" with { type: "json" };
import { runBuild } from "./commands/build.ts";
import { runDev } from "./commands/dev.ts";
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

  cli.command("migrate", "Run database migrations").action(() => {
    runMigrate();
  });

  cli.help();
  cli.version(getVersion());
  cli.parse(argv, { run: false });
  await cli.runMatchedCommand();
}
