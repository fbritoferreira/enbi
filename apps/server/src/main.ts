// @enbi/server — standalone boot entry. The CLI will own this in a later sub-project.
import { serve } from "@hono/node-server";
import { createServer } from "./index.ts";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: createServer().fetch, port });
console.warn(`@enbi/server listening on :${port}`);
