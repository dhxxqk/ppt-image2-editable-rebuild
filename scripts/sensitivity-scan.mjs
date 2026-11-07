#!/usr/bin/env node
/**
 * Sensitive-content scan for everything that would be published.
 *
 *   node scripts/sensitivity-scan.mjs [--json] [--deny-list <file>]
 *
 * Scans files tracked by git (so ignores are respected) for: absolute local
 * paths, Google Drive folder/file links and IDs, private mount names, binary
 * office/image artifacts outside the synthetic fixture folder, and obvious
 * credential shapes. Exit code 1 when anything is found.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const TEXT_EXT = /\.(mjs|js|ts|json|md|py|ya?ml|txt|ps1|sh|gitignore|gitattributes)$/i;
const ALLOWED_BINARY_PREFIX = "tests/fixtures/";

/** Files already present in the base branch are not "new" binary leaks. */
function baseTreeFiles(base) {
  try {
    const out = execFileSync("git", ["ls-tree", "-r", "--name-only", base], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return new Set(out.split(/\r?\n/).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Heuristic: a NUL byte in the first 8 KiB means binary. */
function looksBinary(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(8192);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, read).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}

// Private mount names are assembled from code points so this scanner's own
// source never contains the literal it searches for.
const CLOUD_MOUNT_NAMES = ["\u6211\u7684\u4e91\u7aef\u786c\u76d8"];

const RULES = [
  { id: "absolute-user-path", re: /[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/g, detail: "absolute Windows user path" },
  { id: "absolute-drive-path", re: /[A-Za-z]:[\\/](?:Project|\u4e91\u76d8)[\\/]/g, detail: "absolute local project/cloud path" },
  { id: "drive-folder-url", re: /drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]{15,}/g, detail: "private Google Drive folder link" },
  { id: "drive-file-url", re: /drive\.google\.com\/file\/d\/[A-Za-z0-9_-]{15,}/g, detail: "private Google Drive file link" },
  { id: "cloud-mount-name", re: new RegExp(CLOUD_MOUNT_NAMES.join("|"), "g"), detail: "private cloud mount name" },
  { id: "credential-shape", re: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"']{12,}["']/gi, detail: "possible credential literal" },
];

function trackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return out.split("\0").filter(Boolean);
  } catch {
    // Fall back to a filesystem walk so the scan also works outside git.
    const found = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".git", "out", "builds"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else found.push(path.relative(process.cwd(), full).split(path.sep).join("/"));
      }
    };
    walk(process.cwd());
    return found;
  }
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const denyIdx = args.indexOf("--deny-list");
let denyList = [];
if (denyIdx !== -1 && args[denyIdx + 1]) {
  const file = path.resolve(args[denyIdx + 1]);
  if (fs.existsSync(file)) {
    denyList = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }
}

const findings = [];
const skipped = [];
const preExistingBinaries = [];
const base = process.env.SCAN_BASE || "origin/main";
const baseFiles = baseTreeFiles(base);
for (const rel of trackedFiles()) {
  // A sparse checkout leaves tracked files absent from the working tree; they
  // are still part of the repository, so report them instead of failing.
  if (!fs.existsSync(rel)) {
    skipped.push(rel);
    continue;
  }
  const ext = path.extname(rel);
  const isText = TEXT_EXT.test(rel) || path.basename(rel).startsWith(".git") || !looksBinary(rel);
  if (!isText) {
    if (rel.startsWith(ALLOWED_BINARY_PREFIX)) continue;
    if (baseFiles.has(rel)) {
      preExistingBinaries.push(rel);
      continue;
    }
    const size = fs.statSync(rel).size;
    findings.push({
      file: rel,
      rule: "binary-artifact",
      detail: `new binary file ${ext || "(no ext)"} of ${size} bytes outside ${ALLOWED_BINARY_PREFIX}`,
    });
    continue;
  }
  const content = fs.readFileSync(rel, "utf8");
  for (const rule of RULES) {
    const matches = content.match(rule.re);
    if (matches) findings.push({ file: rel, rule: rule.id, detail: rule.detail, samples: [...new Set(matches)].slice(0, 3) });
  }
  for (const needle of denyList) {
    if (content.includes(needle)) findings.push({ file: rel, rule: "deny-list", detail: `contains deny-listed string`, samples: [needle] });
  }
}

const result = {
  status: findings.length ? "FAIL" : "PASS",
  files_scanned: trackedFiles().length - skipped.length,
  files_not_materialized: skipped,
  pre_existing_binaries_allowed: preExistingBinaries,
  deny_list_size: denyList.length,
  findings,
};
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(
    `scanned ${result.files_scanned} tracked file(s); not materialized: ${skipped.length}; pre-existing binaries allowed: ${preExistingBinaries.length}; deny-list entries: ${denyList.length}`,
  );
  for (const f of findings) console.log(`[FAIL] ${f.rule} in ${f.file}: ${f.detail} ${f.samples ? JSON.stringify(f.samples) : ""}`);
  console.log(result.status === "PASS" ? "SCAN_CLEAN" : `SCAN_FAILED (${findings.length})`);
}
process.exit(findings.length ? 1 : 0);
