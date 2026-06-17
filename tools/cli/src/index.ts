// @enbi/cli — dev/build/start commands land in a later sub-project (ADR-0009).
import pkg from "../package.json" with { type: "json" };

export function getVersion(): string {
  return pkg.version;
}
