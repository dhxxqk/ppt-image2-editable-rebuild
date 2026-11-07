#!/usr/bin/env node
/**
 * Fast environment gate.
 *
 *   node scripts/build-env-check.mjs --config <config.json> [--json]
 *
 * Answers "can this machine run a rebuild?" in one pass: engine entry, master,
 * Node, Python packages, LibreOffice render CLI and icon assets. Exit code 1
 * with a machine-readable reason when anything is missing.
 */
import path from "node:path";
import { loadConfig, makePathResolver } from "../src/config/index.mjs";
import { runEnvironmentChecks, formatCheck } from "../src/engine/diagnostics.mjs";

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const cur = argv[i];
    if (!cur.startsWith("--")) continue;
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else args.flags.add(key);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.config) {
  console.error("usage: node scripts/build-env-check.mjs --config <config.json> [--python <python.exe>] [--json]");
  process.exit(2);
}

let loaded;
try {
  loaded = loadConfig(args.config);
} catch (error) {
  const payload = { status: "FAIL", stage: "config", error: error.message, issues: error.issues || [] };
  console.log(args.flags.has("json") ? JSON.stringify(payload, null, 2) : `FAIL config: ${error.message}`);
  process.exit(1);
}

const { config, baseDir } = loaded;
const resolvePath = makePathResolver(baseDir);
const result = runEnvironmentChecks({
  config,
  resolvePath: (p) => (p ? path.resolve(resolvePath(p)) : p),
  pythonPath: args.python || config.python?.path,
});

if (args.flags.has("json")) {
  console.log(JSON.stringify({ status: result.ok ? "PASS" : "FAIL", checks: result.checks }, null, 2));
} else {
  for (const check of result.checks) console.log(formatCheck(check));
  console.log(result.ok ? "ENV_READY" : "ENV_NOT_READY");
}
process.exit(result.ok ? 0 : 1);
