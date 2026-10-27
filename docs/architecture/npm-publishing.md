# Publishing the CLI and the MCP server to npm

Status: prepared, not published (#422). Nothing here publishes; the owner decides. Measured on `origin/main` with `pnpm pack` and a scratch install.

## Audit

| | `@bimvoice/ifcsheet` (CLI + engine) | MCP server (`packages/mcp`) |
|---|---|---|
| Name | `@bimvoice/ifcsheet`, ours; not on npm | `@ifc-lite/mcp`, **ifc-lite's name** (their 0.27.3 is on npm; this copy is 0.23.0). Must not be published by us |
| `private` | `true` (kept) | not private; `publishConfig.access: public` |
| Tarball | 661 KB packed, 2.3 MB unpacked, 644 files (with source maps) | 347 KB packed, 1.5 MB, 427 files (needs `dist/`, built) |
| `bin` | `ifcsheet` -> `dist/bin.js` | `ifc-lite-mcp` -> `dist/cli.js` |
| `files`, `exports`, `engines`, `repository`, `license`, `description`, `keywords` | all set (this PR added `engines`, `bugs`, `homepage`, `publishConfig`, `LICENSE`/`NOTICE` in `files`, map exclusion) | set, but `engines` is node >=18 (stale), `author` and `repository` are ifc-lite's, no LICENSE/NOTICE shipped |
| npm README | yes (install and MCP sections added) | yes (ifc-lite's) |
| Runtime assets | `fonts/Inter-Regular.ttf` + OFL shipped. The wasm engine is not in this tarball: it comes with `@ifc-lite/wasm` | wasm via `@ifc-lite/wasm` |
| Workspace-only dependencies | 10 direct `@ifc-lite/*` (`workspace:^`), 18 in the closure, all packages in this repo | 24 `workspace:^` including `@bimvoice/ifcsheet` |
| Licence | MPL-2.0. `LICENSE` and `NOTICE` copied in at pack time by `scripts/copy-package-legal.mjs`; source headers are in `dist/` | MPL-2.0, no LICENSE/NOTICE in the tarball |

## What the install test showed

`pnpm pack` rewrites `workspace:^` to `^<version>`, and every one of the 18 closure packages has that exact version on npm (published by ifc-lite), so `npm install` of the tarball succeeds. But the code on npm is **not** the code vendored here:

- `npx ifcsheet --help` fails on load: `@ifc-lite/create` from npm does not export `DOOR_OPERATIONS`. The dist of `create`, `data`, `drawing-2d`, `export`, `geometry`, `lists`, `mutations`, `parser`, `rules` differs from the npm tarballs of the same version.
- With the 10 direct dependencies overridden to this repo's packed copies it fails next on `@ifc-lite/ifcx` (no `IFCX_LENGTH_UNIT_SCALE`).
- With all 18 overridden to this repo's packed copies, `ifcsheet --help` and `ifcsheet build FZK-v2.ifc --out x.pdf` work (4 sheets, 268 KB PDF), wasm included.

## Decisions for the owner

1. How the vendored `@ifc-lite/*` code reaches users (the blocker). Options: publish the 18 closure packages under our own scope (rename, new versions); bundle them into `@bimvoice/ifcsheet` (esbuild, copy the wasm next to it); upstream the fork's changes and depend on their releases; or keep the CLI private and distribute a bundled binary or Docker image instead.
2. The MCP server name. `@ifc-lite/mcp` is ifc-lite's and we do not own that scope. Options: a new package `@bimvoice/ifcsheet-mcp` (own name, `author`, `repository`, `engines`; same dependency question as 1); fold the MCP bin into `@bimvoice/ifcsheet`; or leave it unpublished.
3. The `@bimvoice` npm scope and the `NPM_TOKEN` secret (the scope must exist and the token be an automation token with publish rights).
4. Guard against `changeset publish` / `pnpm -r publish` trying the `@ifc-lite/*` names (inherited `release:npm`, `publish:npm`, `RELEASE.md`): mark them `private` or remove those scripts once 1 is decided.

## The remaining step

After decisions 1 to 3: set `"private": false` in `packages/ifcsheet/package.json` (a bundled build also changes `dependencies`), add the `NPM_TOKEN` secret, then run the "Release npm (manual)" workflow (`workflow_dispatch`, `confirm` = `publish`, `dry_run` first).
