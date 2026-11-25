# Publishing the CLI and the MCP server to npm

Status: installable, not published. Decision 1 is settled (2026-11-24): our `@ifc-lite/*` copies travel inside the one `@bimvoice/ifcsheet` tarball, see "The one tarball" below. Nothing here publishes; the owner starts the release workflow. Measured on `origin/main` with `pnpm pack` and a scratch install.

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

## The one tarball

`node scripts/pack-ifcsheet.mjs --out <dir>` writes `bimvoice-ifcsheet-<version>.tgz` (9.3 MB). It carries the engine's `dist/`, the font, and under `node_modules/` this repository's built copies of the 18 `@ifc-lite/*` packages the engine reaches, the wasm geometry engine among them, as npm bundled dependencies. Nothing is published under a name that is not ours. What those packages need from the registry (`fflate`, `jspdf`, `decimal.js`, `jszip`, `@noble/hashes`, `@xmldom/xmldom`, `laz-perf`, `commander`) becomes a plain dependency of the package; `@tauri-apps/api` is left out, as it is wanted only inside a third party's desktop shell. What a bundled package loads only on request and marks as an optional peer dependency (`peerDependenciesMeta.optional`) becomes an optional peer of the package and is not installed: today `apache-arrow` and `parquet-wasm`, which only the Parquet export of `@ifc-lite/export` loads (by dynamic `import()`). Who wants that export installs both; without them it fails with the command to run. The viewer keeps both as its own dependencies.

Why bundled dependencies and not a single bundled file: the package has over fifty entry points with type declarations that name `@ifc-lite/*` types. Carrying the packages as they are keeps every entry point and every type working without a second build to maintain.

`scripts/pack-ifcsheet.install.test.mjs` packs, installs the tarball in an empty folder with `npm install`, and builds AC20-FZK-Haus into a PDF and DXFs with the `ifcsheet` command and through the library entry points. CI runs it in the Package tests job, and the release workflow runs it before it publishes that same tarball. `packages/ifcsheet/package.json` stays `"private": true`; only the staged manifest inside the tarball is not, so `changeset publish` and `pnpm -r publish` still cannot send it.

Install size, measured on macOS with npm 11 in an empty folder (2026-11-25): 115 MB on disk and 41 registry packages, down from 143 MB and 48 before the Parquet writer became an optional peer. The tarball is 9.3 MB either way. The largest parts left are our bundled copies (53 MB, the wasm engine and the generated schema among them) and `jspdf` (29 MB) with its own optional dependencies (`core-js`, `html2canvas`, `canvg`, `dompurify`, about 23 MB), which it loads only for HTML rendering; `npm install --omit=optional` leaves those out (91 MB) and the drawing set still builds, but that is the installer's choice, our manifest cannot make it.

## Decisions for the owner

1. Settled: bundled into the one tarball (above). The options that were weighed: How the vendored `@ifc-lite/*` code reaches users (the blocker). Options: publish the 18 closure packages under our own scope (rename, new versions); bundle them into `@bimvoice/ifcsheet` (esbuild, copy the wasm next to it); upstream the fork's changes and depend on their releases; or keep the CLI private and distribute a bundled binary or Docker image instead.
2. The MCP server name. `@ifc-lite/mcp` is ifc-lite's and we do not own that scope. Options: a new package `@bimvoice/ifcsheet-mcp` (own name, `author`, `repository`, `engines`; same dependency question as 1); fold the MCP bin into `@bimvoice/ifcsheet`; or leave it unpublished.
3. The `@bimvoice` npm scope and the `NPM_TOKEN` secret (the scope must exist and the token be an automation token with publish rights).
4. Guard against `changeset publish` / `pnpm -r publish` trying the `@ifc-lite/*` names: done (#422). Every vendored package is `"private": true` and `scripts/check-publish-allowlist.mjs` (allowlist: `@bimvoice/ifcsheet`) runs first in `release:npm`, `publish:npm`, `publish:dry`, the release workflow and CI. It refuses any non-private package off the allowlist and never accepts an `@ifc-lite/*` name. Side effect: `check-changeset-required` no longer asks for changesets on the vendored packages, since it skips private ones.

## The remaining step

After decision 3 (the `@bimvoice` npm scope and its token; decision 2, the MCP server's name, does not block the engine): add the `NPM_TOKEN` secret (as an environment secret, see below), then run the "Release npm (manual)" workflow (`workflow_dispatch`, `confirm` = `publish`, `dry_run` first).

## Release hardening

`release-npm.yml` pins every action by full commit SHA (version in a trailing comment), grants only `contents: read` and `id-token: write` (the latter for `--provenance`), and runs the publish job in the `npm-release` GitHub environment.

Repo owner to-do: create the `npm-release` environment (Settings, Environments) with required reviewers, and store `NPM_TOKEN` there as an environment secret, not a repository secret, so a publish waits for approval. Until the environment is configured, GitHub auto-creates an unprotected one on first use, so the other guards stay in place as belt-and-braces: the `confirm` = `publish` input and `"private": true` in `packages/ifcsheet/package.json`.
