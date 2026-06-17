# @enbi/cli

The `enbi` command-line tool — the entrypoint for an [enbi](https://enbi-cms.com) project. It loads
your `enbi.config.ts` (via jiti) and runs the framework from your dependencies.

```bash
enbi generate   # write a versioned migration from your schema → ./drizzle
enbi migrate    # apply pending migrations (tracked in _enbi_migrations)
enbi dev        # auto-sync schema (drizzle-kit push) + run server + Astro admin
enbi build      # build the admin for production
enbi start      # production server (no sync/watch)
enbi keys create --role admin --label ci   # mint an API key (printed once)
enbi keys list
enbi keys revoke <id>
```

Flags: `--config <path>`, `--port <n>` (dev/start), `--dir <path>` (generate/migrate). Part of the
enbi framework — see the [repo](https://github.com/fbritoferreira/enbi). GPL-2.0-only.
