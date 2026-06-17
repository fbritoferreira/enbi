#!/usr/bin/env node
import { getVersion } from "../src/index.ts";

const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
  console.warn(getVersion());
} else {
  console.warn("enbi — commands (dev/build/start) coming soon. Try --version.");
}
