#!/usr/bin/env node
import { EnbiError } from "@enbi/db";
import { run } from "../src/index.ts";

run(process.argv).catch((error: unknown) => {
  if (error instanceof EnbiError) {
    console.error(`enbi: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
