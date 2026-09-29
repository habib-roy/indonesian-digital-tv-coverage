/** Validate data/*.json against the schema in src/lib/core/data.ts. Runs in `pnpm check` and CI. */
import { readFileSync } from "node:fs";
import { validateData } from "../src/lib/core/data.ts";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const errs = validateData(read("service-areas.json"), read("transmitters.json"));
for (const e of errs) console.error(`✗ ${e}`);
if (errs.length) process.exit(1);
console.log("✓ data valid");
