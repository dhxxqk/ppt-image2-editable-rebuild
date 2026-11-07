# Privacy policy for fixtures and repository content

This repository is **public**. It contains the rebuild engine, its tests and
synthetic examples — never a real deck, a real reference image, or a real
business string.

## Allowed in this repository

- Source code, schemas, documentation.
- Synthetic fixtures under `tests/fixtures/`: invented text, invented dates,
  geometrically drawn placeholder icons.
- Generic engine names and API descriptions (`@oai/artifact-tool` is named,
  never shipped).

## Never allowed

| Category | Example | Why |
|---|---|---|
| Presentation bases | a corporate master `.pptx` with a real logo | brand asset, not redistributable |
| Reference renders | the image used as the visual target | often generated, always project-specific |
| Business text | card bodies, dates, titles from a real deck | confidential content |
| Customer identity | organization names, logos, people | personal/corporate data |
| Local paths | a Windows user-profile path, a mapped drive letter | leaks usernames and machine layout |
| Cloud links and IDs | Drive folder/file IDs, share URLs | grants access to private material |
| Private runtimes | `@oai/artifact-tool`, `granola`, other vendor binaries | licence and size |
| Credentials | tokens, API keys, cookies | obvious |

## Enforcement

Two mechanisms, both cheap enough to run on every change:

1. `.gitignore` excludes office documents, images, `out/`, `builds/`, private
   configs and local caches. `tests/fixtures/**/*.png` is explicitly re-allowed.
2. `node scripts/sensitivity-scan.mjs` scans every **git-tracked** file for
   absolute user paths, drive paths, Drive folder/file URLs, private mount
   names, credential-shaped literals, and binary artifacts outside
   `tests/fixtures/`. It exits non-zero on a hit, so it can gate a commit.

```bash
node scripts/sensitivity-scan.mjs          # human summary
node scripts/sensitivity-scan.mjs --json   # machine-readable
node scripts/sensitivity-scan.mjs --deny-list private-strings.txt
```

`--deny-list` takes a newline-separated list of project-specific strings that
must never appear in a tracked file. Keep that list outside the repository.

## Handling real inputs

A real rebuild reads a private config that lives outside this checkout:

```text
/path/to/private/
  p03.config.json      # business text, absolute paths, hashes
  icons/*.png          # keyed local crops
  baseline/*.png       # accepted render to compare against
```

The build writes only to `--out <dir>`. Neither the config nor the outputs are
tracked: `*.pptx`, `*.png` and `private/` are ignored at the repository root,
and the private directory is expected to sit outside the checkout entirely.

The layer manifest produced by a build records geometry, roles and editability.
It also echoes the page title and chapter name from the config. Treat a real
manifest as private material unless those two strings have been sanitized.

## Reviewing a change before publishing

```bash
git status --short
node --test
node scripts/sensitivity-scan.mjs
git diff --stat origin/main...HEAD
```

If the scan is clean and the diff touches only `src/`, `scripts/`, `schemas/`,
`tests/` and `docs/`, the change is publishable.
