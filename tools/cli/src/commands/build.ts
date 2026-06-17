// @enbi/cli — `enbi build`: build the admin for production (server is a library).
import { buildAdmin } from "../admin.ts";

export async function runBuild(): Promise<void> {
  await buildAdmin();
  console.warn("enbi: admin built.");
}
