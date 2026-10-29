# Agent guidelines: IfcSheet

How we choose work, what "done" means and the rules of the product are in [CONTRIBUTING.md](CONTRIBUTING.md). Read that first. It applies to people and to AI agents alike.

In short: build what is on the list, one purpose per pull request, see it work in the running app and attach the screenshot, say what you did not check, and keep the logic in plain modules reachable by commands.

Where the IfcSheet code lives: the drawing and documentation layer is in `apps/viewer/src` (`drafting/`, `project/`, `components/viewer/drafting/`, `components/viewer/sheets/`). The edition that turns modelling off is set in `apps/viewer/src/edition.ts`.

To check a change: build the packages once (`pnpm turbo run build --filter='./packages/*'`), then in `apps/viewer` run `TEST_PATTERN='<paths you touched>' pnpm test` and `pnpm typecheck`. The whole viewer suite takes over ten minutes, so run the part you touched. This is the one exception to the engine note below that says to run tests only through the root `pnpm test` / `pnpm typecheck`: that note exists because a package-local run reads its siblings' built `dist/`, and the build step above is what makes that safe. If a viewer-local result disagrees with the root `pnpm typecheck` / `pnpm test`, rebuild the packages and trust the root run.

## How we work: standing principles

Read these before every task. They apply to every agent and to people.

1. **A goal you can check.** Before you start, write one line, `DONE WHEN:`, naming a test you can run on your own work (a passing test file, a screenshot matching a reference, an IFC that validates). If you can't write it, ask one question to make the goal measurable. Run the test before you report, and report its result, not your opinion of it.
2. **Use the context, don't guess.** Read the issue, the linked PRs, [LESSONS.md](LESSONS.md) and this file first. If something is missing, say what is missing. Never invent a fact, a number, a file path or a test result.
3. **Match the example.** When an issue or a maintainer points to an example (a screenshot, an earlier PR, a reference sheet), match its structure and level of detail. Without one, build the smallest version that passes `DONE WHEN`, show it, and wait for feedback before building more.
4. **Learn from every correction.** When a maintainer corrects you, add one line to [LESSONS.md](LESSONS.md): the date, what was wrong, the rule from now on (in the maintainer's words where possible). A corrected mistake must not come back. A lesson that applies to every agent also goes into the rules below.
5. **Weekly review.** Once a week, review the last 5 to 10 merged PRs against LESSONS.md, fix the rules or the code so repeated problems can't recur, and summarise what changed in five lines.
6. **The cheapest model that does the job.** Read-only checks, log reading and recipe work go to the cheapest model; code goes to a mid-tier model; foundations, geometry and performance to the strongest. Move a task to a cheaper model only after it matched the stronger one on 3 real examples, and write the result down.
7. **A fixed test set.** Before switching models or after a big change, run these three and compare: `packages/mcp/src/tools/ifcsheet-set.test.ts` (open FZK, build, place, issue), `apps/viewer/src/annotate-set/annotate-set.models.test.tsx` (annotate a whole set), `apps/viewer/src/issue/handover.test.tsx` (issue and handover ZIP).
8. **Prepare, don't publish.** Work on a branch and open a pull request. Agents never merge, deploy, release, post to other repositories or spend money. A maintainer's go is the `ready-to-merge` label or auto-merge set by a maintainer (see [CONTRIBUTING.md](CONTRIBUTING.md)).
9. **Report short, in this order:** what you did, the `DONE WHEN` result, what is waiting for a maintainer, the one next step.

## Claiming work

Several agent sessions push to this repository from one GitHub account. The rules here are how they avoid building the same thing twice. They apply to every agent and every session, including short-lived subagents.

**Respect assignments, and assign yourself before you start.** This is not etiquette, it is the mechanism that stops two people building the same thing.

Before touching an issue:

1. `gh issue view <n> --json assignees,title`: **if someone else is assigned, it is theirs.** See "Helping on someone else's issue" below for the two ways that changes.
2. Look for an open PR on it. `gh pr list --search "<n>"` is a TEXT search: it matches comment bodies, so it both misses linked PRs that never mention the number and returns unrelated ones that happen to contain it. Treat a hit as a reason to look, not as an answer, and confirm by opening the PR. The linked-PR list on the issue page is authoritative where the two disagree.
3. If both are clear, `gh issue edit <n> --add-assignee <you>` **before** writing code, not when you open the PR. An assignment made at PR time claims nothing; the window it needed to cover has already closed.

Check again immediately before opening the PR. A claim can appear while you work, and the second check is the cheap one.

### Every agent is the same GitHub account

`gh issue edit --add-assignee` cannot tell two agents apart: they all push and assign as the **same account**. An assignment to that account means *somebody* claimed this. It does not mean *you* did, and the field cannot tell you which. So treat it as a claim by someone else until you can show otherwise, and **leave a claim comment naming the session**, which is the only artifact that can:

    gh issue comment <n> --body "Claiming this. Session <id>, branch <name>."

If the account is assigned with no claim comment, ask on the issue rather than reading the field as your own. This applies to OUR sessions only. An outside contributor has their own account, so for them the field says what it appears to say.

### The contributor check and the session check are different checks

Doing one does not do the other. Run both, every time:

    gh issue view <n> --json assignees      # is one of us on it
    gh pr list --search "<n>"               # CANDIDATES; confirm on the issue page

The assignee check finds our own sessions. Only the PR search finds an outside contributor, who has no reason to know about an internal assignment: on the engine's repository the shared account was self-assigned and an outside contributor's PR for the same issue appeared 47 minutes later. No assignee field would have helped there.

### When you collide mid-flight

The expensive case is that both of you are already half-built when the claim appears. **The session named in the earliest claim comment decides. The other stops immediately** and hands over what it has as a comment or a patch on that session's PR. "The assignee decides" cannot work here, because the field holds one shared account and cannot name a session.

**An outside contributor's PR takes precedence over any internal claim, however early.** They cannot see our claims and are not bound by them. Stopping mid-build is cheap; two finished implementations of the same thing is not.

### Helping on someone else's issue

Helping is welcome. **Taking over is not.** Two things make it help: they accepted an offer (silence is not a yes), or it has gone quiet (no commits, no word, about a week; even then comment first and wait a couple of days).

Help, no permission needed: reviewing their PR including finding real defects; diagnosing a failing check and posting the cause; answering a question they asked; reporting a defect in shipped code even if their PR introduced it.

Not help, however good the code: building a parallel implementation and announcing it afterwards; carrying an unraised branch that duplicates their work; pushing to their branch; opening a competing PR on their issue.

If you built something before noticing, say so plainly, hand it over, and let them decide. That is recoverable; landing it is not. When you find you have duplicated someone, the owner follows the rules above in order: an outside contributor's PR beats any internal claim; else the earliest claim comment wins; the assignee field decides only when neither applies, since it cannot name a session. Never whoever is further along or noticed first. Do not close the duplicate silently: enumerate what it holds that the survivor does not, and never push to a branch you do not own to "help".

## Engine notes

The sections below are the technical notes of the engine IfcSheet is built on, [ifc-lite](https://github.com/LTplus-AG/ifc-lite), kept here because the code refers to them by section name. They describe how the engine's code behaves. Where they mention that project's own process (issue labels, review bots, release steps), that process is theirs, not ours.

## Commands
- Install: `corepack enable && pnpm install`.
- Build: `pnpm build` (turbo). WASM: `pnpm build:wasm` (needs Rust nightly + `wasm-pack`); `pnpm build:wasm:fetch` pulls the prebuilt wasm from npm when Rust is unavailable (e.g. Windows without WSL).
- Typecheck: `pnpm typecheck` (turbo, wasm-free: no Rust toolchain needed). It covers **test sources too**, through each package's `typecheck` script running `scripts/typecheck-tests.mjs` (generated, gitignored `<pkg>/tsconfig.tests.json`). Do not "fix" a test-only type error by putting tests back into a package's emit tsconfig: that ships them to `dist/`. Why: [agent reference](docs/agents-reference.md#typecheck-covers-test-sources-2457).
- Test: `pnpm test` (turbo, TS); `cargo test --workspace` (Rust, not `cargo check`); `pnpm test:wasm-contract` (real wasm boundary); `pnpm test:collab` (collab pair).
- Always run typecheck/test through the root `pnpm typecheck` / `pnpm test` (turbo) (for IfcSheet, see the one exception at the top of this file), never a package-local script (`pnpm --filter <pkg> typecheck`, `cd packages/<pkg> && tsc --noEmit` / `vitest run`) or an editor's TS server in isolation. `turbo.json` makes `typecheck` depend on `^build`, but that dependency graph only fires through turbo; a package-local script or IDE process resolves workspace siblings straight off their `dist/` (root `tsconfig.json` path-maps most packages to `dist/*.d.ts`; the rest, e.g. `@ifc-lite/pointcloud`, resolve via `package.json#types` → `dist/index.d.ts`). An unbuilt or stale sibling `dist/` then throws "Cannot find module" / missing-export errors that name real files and symbols but describe no bug in the source — rebuild (`pnpm build`) before trusting a bypass-turbo result that disagrees with `pnpm typecheck`/`pnpm test`.
- Dev viewer: `pnpm dev` (full monorepo build, then `--filter viewer dev`; needs a built `@ifc-lite/wasm`).
- Fixtures: `pnpm fixtures` (tests skip when absent). Dead code: `pnpm knip` (TS) / `cargo test --workspace` (Rust).
- Publish: `pnpm changeset`; refresh the API-surface snapshot with `pnpm api-surface:update`.

**House rules.** No `as any` / `@ts-ignore` (fix the types or add a `.d.ts`); no silent `catch {}` (log or rethrow); split production modules over ~400 non-generated lines; new packages and features ship tests; package-specific deps go in the consuming package, never root.

**Which of those a machine enforces, and which you self-police.** The TypeScript house rules above are SELF-POLICED: `tsc --strict` does not flag `as any`, `@ts-ignore` or `catch {}`, and no lint rule here does either. `pnpm lint` runs oxlint over `apps`, `packages` and `scripts`. It gates the ERROR tier (the curated `.oxlintrc.json` list: rules whose every hit here was a real defect) and any per-file RISE in jsx-a11y warnings (`check-jsx-a11y.mjs`). Other warnings are visible, not blocking; a rule absent from that config still runs at warn. oxlint honours `// eslint-disable-next-line <rule>` with the directive on the line DIRECTLY above the offence and a reason above that. Clear warnings in files you are already touching, never in a sweep.

**Rust is NOT self-policed.** CI runs `cargo clippy --workspace --all-targets -- -D warnings`, so a warning-only defect (an unused import, a needless borrow) is a hard CI failure even when `cargo test --workspace` is green locally, because `cargo test` does not fail on warnings. Run that clippy line verbatim before pushing Rust.

**The ~400-line rule is enforced on both sides**: for Rust by the `module_size_ratchet` test in `rust/processing/tests/`, for TypeScript by `scripts/check-module-size.mjs`. A new non-generated, non-test file over 400 lines fails unless it has an allowlist row, and an allowlisted file may not grow past its recorded budget. Prefer splitting to allowlisting. For a module whose bulk is `#[cfg(test)]`, the house pattern is a sibling `<name>_tests.rs` included via `#[cfg(test)] #[path = "<name>_tests.rs"] mod tests;` (see `stream_meta.rs`). The rule binds production modules only; test files are exempt, though a long test file should still be split where it has a genuine logical seam, never merely to hit a line count. Run `node scripts/check-module-size.mjs` locally and read its EXIT CODE (`echo $?`), not just its output: a piped or truncated run has hidden a failure before. Split the file rather than adding an allowlist row (budgets and rows: `scripts/module-size-allowlist.txt`).

**Do not trust any list of CI gates written down in this file.** The authoritative list of gates is `.github/workflows/`; the authoritative list of REQUIRED ones is the `main` ruleset, `gh api repos/:owner/:repo/rulesets`. Read them. A gate list is a measurement, and a measurement recorded as prose goes stale by the next merged workflow.

## IFC schema fidelity
- User-facing APIs/exports/scripts use exact IFC EXPRESS names: PascalCase attributes (`GlobalId`, `Name`, `ObjectType`), full relationship names (`IfcRelAggregates`, not `Aggregates`). Never invent aliases.
- STEP type names are stored UPPERCASE; render via `store.entities.getTypeName(id)` to get `IfcPascalCase`.
- The rule binds **where an EXPRESS name exists**. A derived collection is named for what it holds: `EntityRelationshipsData`'s `voids` / `fills` / `groups` / `connections` hold the related objects, not the `IfcRel*` entities (#2422, don't re-open).
- Frozen, not endorsed: `withAliases` (sandbox) emits both spellings, PascalCase canonical, because sandbox scripts are unversioned; templates' non-entity data shapes (`BimPropertySet.name`, …); and the georeference types `MapConversion`, `ProjectedCRS`, `GeoreferenceInfo` (`eastings`, `factorX`, …), read across the viewer, so a rename is a major (#4673). `server-client`'s `Georeferencing` mirrors the server's snake_case JSON. Fields added to the georeference types keep their casing; other new surface, georeference included, gets the EXPRESS name.

## Models & federation
- **One canonical load path:** every model, primary *and* federated, any format, loads via `useIfcLoader.loadFile(file, target)`; `useIfcFederation.addModel` is a thin wrapper. Never add a second load/ingest pipeline: a federated-only path that drifts from `loadFile` silently skips load-time features.
- Resolve selections/IDs through `FederationRegistry` (`toGlobalId`/`fromGlobalId`/`getModelForGlobalId`), never ad-hoc math; honor the single-model fallback `globalId === expressId`. Verify behaviour at `models.size` of 1 *and* N.
  - **Resolving a globalId back to a model+expressId is the exception: use `modelSlice.resolveGlobalIdFromModels`** (via `resolveEntityRef`, the canonical caller), not the registry. Two reasons, and the first applies always, not just in a narrow window: the registry knows nothing about **overlay-allocated ids**, so an entity created through `StoreEditor` fails to resolve through it entirely — `modelSlice.ts`'s second pass consults `mutationViews` precisely for that. It is also store-backed rather than a singleton, so it cannot be stale right after a model swap. `toGlobalId` and the registry rule above still stand for everything else; do **not** hand-roll the offset arithmetic as a third copy.
- `extractEntityAttributesOnDemand` re-parses the source buffer, so never call it in loops; use cached `EntityNode` getters.

## Geometry & WASM
- Free every WASM handle (`MeshCollection`, `MeshDataJs`, pre-pass cache) deterministically: wrap pre-pass + job batches in `try/finally` so `.free()` / `clearPrePassCache()` run on early return, on throw, **and** when an async generator is abandoned (`.return()` runs `finally`). Getters copy into JS arrays, so `.free()` right after extraction is safe; don't deep-copy already-extracted meshes.
- Coordinates: IFC is Z-up, the viewer is Y-up (converted during mesh parsing). `/api/create` (the `ifc-lite view` CLI REST endpoint) expects IFC Z-up `[x, y, z]`.
- CSG: the **pure-Rust exact kernel** (`rust/geometry/src/kernel/`) is the only CSG kernel on every target; Manifold C++ and the BSP port are deleted, and there is no kernel selection, build-time or runtime. Diagnostics: `csg::take_csg_census()`, `GeometryRouter::take_csg_failures()` / `take_host_opening_diagnostics()`.
- All per-element mesh production converges in `produce_element_meshes` (`rust/processing/src/element.rs`), called by both the native orchestrator and the browser batch (`processGeometryBatch`). Any mesh-shape change (void cut, submesh split, texturing, type geometry) lands there once; a fix applied to only one pipeline silently diverges (the bug class behind #858/#913/#957/#961/#1071). The only sanctioned behavioural fork is `TypeGeometryMode`.
- Workspace `[profile.release]` sets `panic = 'abort'`; harnesses/examples that need `catch_unwind` (per-element panic isolation) must build with `--profile server-release` (panic=unwind).
- Driving `GeometryRouter` directly in examples/harnesses skips the RTC rebase: georeferenced models (>1 km coords, e.g. ISSUE_098 at ~5,000 km) produce f32-fabricated geometry "failures"; bucket by coordinate magnitude or rebase before blaming the kernel.
- Colour and coordinate resolution is canonical Rust shared by the server (`process_geometry`) and viewer (`process_geometry_batch`) so they can't drift; don't re-fork it. Single homes: `default_color_for_type`, `resolve_submesh_color`, **`extract_surface_style_colors`** (the IfcSurfaceStyle to Rendering to Colour leaf; SurfaceColour is the apparent colour, a distinct DiffuseColour IfcColourRgb is only `shading_color`, per #859/#871), and the indexed-colour resolvers, all in `ifc_lite_processing::style`; **`rotation_angle_about_z`** (site/building rotation, off `resolve_scaled_placement`) in `ifc_lite_geometry`. `styling_parity` Rust tests fail the build if a duplicate `get_default_color*` table or a per-pipeline `extract_color_from_rendering`/`extract_color_rgb` reappears. New type default: edit `default_color_for_type` and extend the mesh fixture. Sanctioned exceptions: the 2D drafting fill palette (`IFC_TYPE_FILL_COLORS`, `Drawing2DCanvas.tsx`) is a drafting convention rather than 3D appearance, and standalone debug tools under `rust/geometry/examples/` (can't reach the downstream crate). (#913, #996, #997)
- Cross-platform determinism is enforced weekly by `.github/workflows/determinism.yml` (free `ubuntu-24.04-arm` runner, also `workflow_dispatch`-able before kernel-sensitive merges): it re-runs `exact_predicate_determinism` and `geometry_correctness_harness` on arm64 against the committed x86_64-generated insta snapshots; a snapshot mismatch there means platform-dependent geometry (a real bug, not flake). It also pins the mesh-output manifests `rust/processing/tests/manifests/mesh_determinism.json` (x86_64/arm64) and `mesh_determinism.wasm32.json` (identical except the documented libm-trig gap), so a legitimate geometry-output change must re-pin **both** manifests, not just the snapshots (#1492, see `docs/architecture/mesh-determinism.md`).
- Geometry-affecting PRs also run `.github/workflows/ifcopenshell-parity.yml` (path-gated): a per-PR quick lane diffs ifc-lite against committed reference dumps in `tools/ifcopenshell_reference/`, plus a nightly full lane on the pinned engine. **It IS blocking**: `parity (in-tree fixtures, committed reference)` is a required context in the `main` ruleset, so a legitimate output change means regenerating the committed reference in the same PR (#1519). Being absent from `test.yml`s `needs:` list is a different thing from being non-required.

## Performance
- **Perf-sensitive paths:** `rust/geometry`, `rust/processing`, `rust/core`, `packages/geometry`, `packages/wasm`, `scripts/build-wasm.sh`. A change under these must carry a perf verdict in the PR.
- **Read the ledger before optimizing:** `scripts/perf/README.md` (lever ledger) lists shipped wins, dead ends, and un-shipped levers. Do **not** re-spike a listed dead end without a genuinely new mechanism — isolated microbench wins have been refuted end-to-end three times (#1429 threaded WASM, Manifold, #1445 shared-index). A perf claim is only real as an **end-to-end worker-pool number**, never a kernel-only microbench.
- **Measure base-vs-branch, never vs the committed baseline.** Run `scripts/perf/probe.sh <fixture> --iters 5 --json` on both your base and your branch, and paste the parse/geometry/total deltas **plus a byte-identity statement** (mesh/triangle counts unchanged, or an FNV hash if outputs may legitimately differ). Default fixture: `tests/models/ara3d/AC20-FZK-Haus.ifc`; for CSG/void/mesher changes also run `tests/models/ara3d/ISSUE_129_N1540_17_EXE_MOD_448200_02_09_11SMC_IGC_V17.ifc`, and when feasible a heavy CSG model (Holter/ISSUE_053) since per-PR CI never touches it and that is where every shipped regression has lived.
- **Never cite a local `pnpm benchmark:check` against `tests/benchmark/baseline.json` as evidence** — the baseline is CI-recorded (SwiftShader), so faster local hardware makes it vacuously green. Use the scratch-baseline flow in `tests/benchmark/README.md`.
- **Guard against contaminated measurement:** confirm `packages/wasm/pkg/ifc-lite_bg.wasm` is newer than your `rust/` edits before trusting a WASM number (stale artifacts and turbo overwriting `pkg/` have each caused phantom regression hunts); run each A/B interleaved on an otherwise-idle machine; in the browser, load the target file **first** in a fresh tab (the 7th load in a session runs 2-4x slower from memory pressure, not code).
- **Record the verdict in the repo, not chat.** When a perf PR closes with a measured result, record the *verdict and lesson* (what won/lost and why, so the next agent doesn't re-walk it) in the `scripts/perf/README.md` ledger in the same PR. This is distinct from the *numeric baseline*, which lives only in the generated `perf-numbers` region of `docs/guide/performance.md` (see Documentation upkeep) — the ledger carries the narrative, the docs carry the numbers; don't duplicate a benchmark figure into the ledger prose.

## Build, CI & generated artifacts
- Don't hand-edit `packages/wasm/pkg/*`: change the Rust crates and regenerate with `scripts/build-wasm.sh`. The wasm **runtime** (`.wasm`/`.js`) is gitignored and rebuilt on every Rust-capable host; the **type surface** `pkg/ifc-lite.d.ts` is **committed** (force-added past the wasm-pack `pkg/.gitignore` `*`) for the wasm-free typecheck lane (#952), so `pnpm typecheck` runs **without the Rust toolchain** (`tsconfig.json` path-maps `@ifc-lite/wasm` to `pkg/ifc-lite.d.ts`, and `build-wasm.sh` soft-skips when wasm-pack is absent). `build-wasm.sh` strips the platform-variant `__wasm_bindgen_func_elem_*` trampoline indices from the `.d.ts` so the sync gate can exact-diff across macOS/Linux, so only ever regenerate it via that script. When a Rust public-API change alters the bindings, re-run `build-wasm.sh` and **commit** the regenerated `pkg/ifc-lite.d.ts`; CI (`test.yml`, "Verify committed wasm types are in sync") fails if it drifts. `build-wasm.sh` also rewrites `pkg/README.md` and `pkg/package.json`, which is why **neither is tracked** — they fall under the `pkg/.gitignore` `*` like the runtime, so the churn can no longer reach a commit. Nothing reads them: the workspace member is `packages/wasm/package.json` (a different package name, and its `files` ships only the runtime plus the `.d.ts`), and the package README the docs gate checks is `packages/wasm/README.md`.
- The wasm build needs only the pinned Rust nightly + `wasm-pack` (the Manifold C++ / LLVM-20 cross-toolchain was removed at M9; the bundle is pure Rust). That toolchain is single-sourced in the `.github/actions/setup-wasm-build` composite action: change it there once, not per-workflow (`git grep -l setup-wasm-build .github/workflows` lists the consumers).
- ifc-lite ships a **web viewer** plus a headless CLI/MCP/server only; there is no first-party desktop app (removed: the `apps/desktop` Tauri shell and the viewer override-contract are gone). The desktop **capability** lives in `@ifc-lite/geometry` (`IPlatformBridge` / `NativeBridge` / `isTauri()`, `@tauri-apps/api` optional dep) for third parties building their own Tauri shell; keep it web-pure (it must never be imported on the web path, and is lazy-loaded only under `isTauri()`).
- The Rust tree is intentionally not rustfmt-clean and no CI runs fmt: never run a repo-wide `cargo fmt` (it produces a 100+ file reformat blast that buries the real diff). Format only the lines you touch.
- Beyond the server, CLI, SDK, and wasm, a fifth Rust consumer exists: the PyO3 wheel `ifclite_geom` (`rust/python`, abi3-py39). Public-API changes in the Rust crates it builds on can break it; `.github/workflows/python-wheels.yml` carries the path gate and publishes on an `ifclite-geom-v*` tag.
- Adding or changing a sandbox bridge method (`packages/sandbox/src/bridge-*.ts`, i.e. `NAMESPACE_SCHEMAS`) also changes the generated ambient `bim` type surface, `apps/viewer/src/lib/scripts/templates/bim-globals.d.ts` (the types the built-in template scripts under that folder are written against). Run `pnpm generate:bim-globals` and commit it; CI (`node scripts/generate-bim-globals.mjs --check`, node-tests job) fails on drift. The editor completions and the LLM system prompt read `NAMESPACE_SCHEMAS` live, so the `.d.ts` is the only consumer that *can* rot — and it did: it never carried `bim.clash` (#891 → #2418) and lost two `create` parameters at #598, because the generator had stopped running and the file got hand-edited instead. Never hand-edit it; fix the schema and regenerate.
- A `tsReturn` / `tsParamTypes` may NAME a type instead of spelling its shape inline (`Promise<BimClash.ClashResult>`). Those declarations are extracted from their defining package by `scripts/generate-bim-globals.mjs` (`DERIVED_TYPE_SOURCES` / `DERIVED_TYPE_ROOTS`) — never transcribe another package's types into the generator, which would be a hand-maintained copy in the one script whose purpose is to stop copies rotting (#2422). Referencing a type the generator cannot resolve is a hard error telling you which list to add the file to. `pnpm check:templates` (node-tests job) typechecks the built-in templates against the generated surface and is what catches a `tsReturn` naming a type that is never emitted; its tsconfig keeps `skipLibCheck: false` on purpose, because the generated `.d.ts` is the subject of that check rather than a dependency of it.
- `Cargo.lock` is committed (app crates need reproducibility; an upstream yank broke CI once). Refresh with `cargo update -p <crate>`, never by deleting it.
- Neither a PR branch nor `main` deploys to Vercel: previews are off on all three projects via their Ignored Build Step, and production moves only when `.github/workflows/deploy-nightly.yml` fast-forwards the `production` branch (05:45 UTC nightly, or `workflow_dispatch` with a ref already on `main`) — so a merge is live within 24h, not 20 minutes. To preview a branch on demand, and for the per-project setup and cost rationale: [`scripts/README-vercel-cost.md`](./scripts/README-vercel-cost.md) sections 3a-fix and 3d.
- Read a single job's log before the run finishes: `gh api repos/BIMvoice/ifcsheet/actions/jobs/<job-id>/logs`. The required check is the "CI passed" aggregate in `.github/workflows/ci.yml`.
- Never copy build outputs (`packages/wasm/pkg`, `dist`) between worktrees. Build them with `pnpm turbo run build --filter='./packages/*'` (wasm: `pnpm build:wasm` or `pnpm build:wasm:fetch`) in the worktree that needs them.

## Documentation upkeep
- A public API or CLI flag change updates the matching guide in the **same PR**. `docs/guide/*.md`, `docs/tutorials/*.md`, and the README carry live `ts`/`typescript` snippets that CI typechecks against each package's `src` (`pnpm docs:check-samples`), so a renamed export or changed signature fails the build until the snippet is fixed. Snippets use shared ambient globals (`scripts/docs/doc-samples-globals.d.ts`); a snippet that is deliberately illustrative pseudo-code opts out with `<!-- docs-check: skip -->` on the line directly above the fence (use sparingly — prefer fixing it).
- Perf and size numbers live **only** inside the generated `perf-numbers` region of `docs/guide/performance.md`, stamped from `tests/benchmark/baseline.json`. Don't hand-write a benchmark number into prose; refresh the region with `pnpm docs:generate` after recording a new baseline.
- The package table in `docs/api/typescript.md` and the CLI command table in `docs/guide/cli.md` are generated (`<!-- BEGIN/END GENERATED -->` regions). Edit the source (each `package.json` description, the CLI `HELP` text), then run `pnpm docs:generate`; CI (`pnpm docs:check-generated`) fails if a region is stale.
- Every new published package ships a `README.md` (it is the npm landing page); CI enforces this with `pnpm docs:check-readmes`.

## Changesets & published API
- Changes to published `packages/*` need `pnpm changeset` (never hand-edit versions or `CHANGELOG.md`). Bump level = biggest API change: removing/renaming an export is `major` (>=1.0 pkg) or `minor` (0.x), never `patch` when the surface shrank.
- Only re-export from a package's `index.ts` what has a real consumer: an unused public export is permanent semver liability.
- The exported surface of every published package is snapshotted in `scripts/api-surface.json` and CI-enforced (`scripts/check-api-surface.mjs`): when you intentionally add/remove/rename an export, run `pnpm api-surface:update` and commit the snapshot alongside the changeset.

## Removing & replacing code (anti-cruft)
- Supersede means delete: replace a path, remove the old one in the *same* PR. No "legacy"/"fallback"/"just-in-case" path; if one must stay, gate it behind `// TODO(remove-by: <cond>, <owner>)` and a tracking issue.
- Delete dead code with the change that orphans it. When renaming/removing a public symbol, grep the whole repo (`docs/`, `examples/`, `scripts/`, `*.md`) and fix every reference in the same PR.
- Prove removals: TS with `pnpm knip` (on-demand, not a CI gate); Rust with `cargo test --workspace`, **not** `cargo check` (check skips `#[cfg(test)]`, so a test-only reference to a deleted fn slips through). Intentionally-unused Rust items need `#[allow(dead_code)]` and a why.

## Test fixtures
- Not committed (no LFS): catalogued in `tests/models/manifest.json`, fetched via `pnpm fixtures`. Tests must **skip** (never throw/panic) when a fixture is absent; point to `pnpm fixtures` in the skip message. Add one: drop under `tests/models/<group>/`, run `pnpm fixtures:manifest`, then `pnpm fixtures:upload`; commit only the manifest. CI runs `pnpm fixtures` before tests.

## Bounding walks over file-supplied references

Entity references come from the file, so a recursive walk over a self-referential entity dies by uncatchable `SIGABRT` (in the wasm geometry worker it takes down the instance); #2866 found seven such sites. A depth cap, a visited set and a work budget each leave a hole alone, so use the right combination. Prefer an **iterative** walk; use a **global/memoising** visited set when the result is a pure function of the id, a **path-scoped** one when output accumulates (a global set silently drops geometry); reuse `ifc_lite_core::limits`. A guard must both bound the work and report that it did. `scripts/check-refwalk-guards.mjs` (CI) enforces only the presence of a guard; its allowlist `scripts/refwalk-guard-allowlist.txt` is empty. Full reasoning and the three mechanisms: [agent reference](docs/agents-reference.md#bounding-walks-over-file-supplied-references).

## Writing tests
- A new test must assert behavior through a real fixture or a stated invariant. Don't write: set-state-then-read-it-back store tests, tests that assert a mock's return value (they test the mock), constructor/setter tautologies, or byte-for-byte output pinning unless the byte layout IS the compatibility contract (e.g. signed bundles). Regression tests cite the issue/PR number in the test name or a comment. Before calling a test done, revert or mutate the fix and confirm it goes red (see "A test that fails without your change" in [CONTRIBUTING.md](CONTRIBUTING.md)); several passing tests were vacuous until a mutation run showed it.
- Every package with test files needs a `test` script in its package.json or `turbo test` silently skips it; `scripts/check-test-wiring.mjs` (CI) enforces this. Packages use vitest OR node:test via `tsx --test`; match the package's existing convention, never mix within a package.
- **A new gate under `scripts/` must be INVOKED, and a package.json entry is not invocation.** A guard nothing runs is the same absence as a guard that finds nothing, and it is invisible in exactly the same way: #3062 shipped a gate script and its test with no workflow step, no `package.json` script and no turbo task, and nothing flagged it.

- **A new gate under `scripts/` must be INVOKED, and a package.json entry is not invocation.** A guard nothing runs is the same absence as a guard that finds nothing (#3062). `scripts/check-test-wiring.mjs` audits `check-*` / `verify-*` files at any depth and `scripts/*.test.mjs`; it accepts a `.github/workflows/` step running the gate, a root script a workflow reaches through `pnpm`, a workspace script reached by a turbo task, or a file an already-reached script imports or spawns. A script that should not run in CI declares `@unwired-by-design <reason>` in its header. Accepted wirings and stated holes: [agent reference](docs/agents-reference.md#wiring-a-new-gate-under-scripts).
- **Never assert on a source file's text.** A test that reads `Thing.tsx` and greps it certifies a string exists, not that the code works: `SearchModal.filter.wiring.test.tsx` asserted the whole body of `handleRowClick` and stayed 5/5 green when `onRowClick={handleRowClick}` was replaced with `onRowClick={() => {}}` — defect #2396 verbatim. `scripts/check-source-text-assertions.mjs` (CI) blocks new ones; the remaining list is in `scripts/source-text-assertion-allowlist.txt` and only ratchets down (#2434).
- **Testing a viewer component.** It is mountable, including one that reads `useViewerStore` (seed it with `setState`); the recipe (`@/test/setup-dom.js` first, `render`/`click`/`advance`, `fixtureModel`) and the mounting notes are in the [agent reference](docs/agents-reference.md#testing-a-viewer-component). Assert behavior, not wiring: an unreachable component, ignored hook result, or uncalled handler can look correct in source (#2434).
- Golden sheets (#363): a changed drawing fails the package tests naming sheet and field; an intended change runs `pnpm --filter @bimvoice/ifcsheet benchmark:update` and commits the `benchmark/accepted/` diff.
- Geometry/WASM changes: mocked `@ifc-lite/wasm` tests prove nothing about the boundary; `pnpm test:wasm-contract` runs the real `buildPrePassOnce`/`processGeometryBatch` path and pins the field surface plus unit-scale contract. Extend it when adding wasm API surface. It skips clean (exit 0) if the wasm runtime isn't built, so a local green there proves nothing unless you ran `scripts/build-wasm.sh` first (CI restores the built artifact before the step).

## CLI
- Discover the full SDK API with `ifc-lite schema` (JSON). `eval` runs SDK expressions (`ifc-lite eval model.ifc "bim.query().byType('IfcWall').count()"`); always pass `--json` for machine output. `HeadlessBackend` (`packages/cli/src/headless-backend.ts`) runs query/export/create/IDS/BCF without a renderer.

## Collaboration server
- `collab-server` (`packages/collab-server`) persists CRDT state (Yjs update frames plus room/audit logs) to disk, so a persistence-format change needs legacy migration or you poison existing rooms (a data-loss class, #1501). Exercise the pair with `pnpm test:collab` (beyond `turbo test`); run the server with `pnpm collab:server`. Recipients rebuild the model from the CRDT via IFCX (`snapshotToIfcx` then `parseIfcxViewerModel`), not a legacy STEP transport.

## Browser exports (viewer)
- One way to save a file: `apps/viewer/src/lib/export/download.ts`. Use `downloadBlob` / `downloadFile` / `downloadDataUrl`; never hand-roll an `<a download>` plus `URL.createObjectURL` dance, and never write another filename regex. `downloadFile` already copies the wasm `Uint8Array<ArrayBufferLike>` into a `BlobPart`, and emits `emitFileDownloaded` (`lib/tours/events`) so task-gated tours can observe saves; a bespoke download path breaks tour progression, not just filename handling.
- Run every user/model-derived filename through `sanitizeFilename` (preserves case and dots, strips only OS-unsafe chars, see #1299). It is *not* a slug; don't lowercase or hyphenate names for filenames. Slugs (extension IDs) are a separate concern.
- CSV and list exports neutralize spreadsheet formula injection on user-derived cells, including BOM-prefixed values (#1506). Route any new export column through the existing sanitizer; never hand-roll a CSV writer that skips it. Never hand-roll an escaper: call `escapeCsvCell()` / `guardSpreadsheetFormula()` from `@ifc-lite/export`; `scripts/check-csv-escaper-copies.test.mjs` fails CI on a new copy (#317 and #324 both added one).

## Tour anchors & demo kit (viewer walkthroughs)
- Elements carrying `data-tour` are interactive-tour anchors. If you move, rename, or delete one, update `apps/viewer/src/lib/tours/anchors.ts` and the referencing steps under `apps/viewer/src/lib/tours/tours/` in the same PR. An anchor no component renders fails `anchors.contract.test.ts`; one unmounted when its step runs auto-skips and fires a `tour_step_broken` PostHog event. Tour telemetry (`lib/tours/telemetry.ts`) carries only registry ids, enums, and numbers, never file or model names (scrub-safe).
- The tour demo kit reuses the committed `building-architecture.ifc` sample as its base; its variants (`building-architecture-rev-b.ifc`, `building-architecture.ids`, `demo-kit.json`) are derived from that base by `tools/demo-kit/derive-variants.mts`. Revision B preserves the base's GlobalIds (diff matches on GlobalId, so a regenerated base would make compare read as 100% added/deleted) and carries the injected clash. Never hand-edit or regenerate one artifact in isolation; rerun the derivation script, which self-verifies the IDS/clash/diff invariants.

## Working in parallel: rules learned the hard way

**Keep the queue small** (2026-10-29: about 50 open PRs re-conflicted each other on every merge; most CI time and agent work went into re-merging)
- At most 5 open agent PRs. Do not open a new one while 5 are open: get one merged first.
- One open PR per area (joinery, drafting, engine/CLI, i18n, standards, permits, CI). A second change in the same area waits for the first to merge, then branches from `main`.
- Update a PR with `main` only when it is next to merge. Every push requeues a full CI run, and a PR updated early conflicts again before its turn.
- The files almost every conflict came from: `project/fields/index.ts`, `index-exports.snapshot.json`, the CLI fixtures `cli-usage.main.txt` and `cli-argv.main.json`, `ro-coverage-baseline.json`, the i18n barrels and `locales/ro.test.ts`, the command `registry.ts`, `STEP_FIELDS` in `draft-store.ts`, `playwright.config.ts`. Touch them only through their extension points (below), and regenerate generated files with their update command, never by hand.
- A merge that git reports as clean can still duplicate code: a clean merge put the Germany pack into `standard-pack.ts` twice. After merging `main`, grep the touched files for duplicate exports, keys and ids.

**Git**
- Merge `origin/main` into your PR branch to resolve conflicts. Never rebase a pushed branch, never force-push, never `git stash` (the stash stack is shared across worktrees; use a second worktree).
- After a merge, diff every conflicted file against BOTH parents (`git diff MERGE_HEAD <file>` and `git diff HEAD <file>`) for silently dropped lines; auto-merged test counts went wrong twice.
- Never stack PRs: CI only runs against `main`. Do not start work that depends on an unmerged PR; wait for it.
- To wait on a PR, poll with a loop that prints the state every round. A silent monitor missed a merge and cost 25 minutes.

**Lists every feature adds to**
- A list that many PRs extend is one file per entry, discovered, so two PRs adding different entries never edit the same line. In the viewer a registry finds its files with `import.meta.glob` (eager, patterns relative to the registry, `*` only in the file name). The node test runner rewrites exactly that subset (`apps/viewer/src/test/import-meta-glob.mjs`, loaded by `vite-module-hooks.mjs`) and leaves any other form alone, so it fails under test as it always did. The session import guard follows eager globs like static imports.

**One code path for the app and the engine**
- Logic that the app, the CLI and MCP all need lives once in `packages/ifcsheet` and the app calls it, with a parity test. Examples: `viewStyler` (`view-style.ts`), `classificationOf` (`classification.ts`).
- A new public export of `@bimvoice/ifcsheet` goes in the sub-barrel of its area, `packages/ifcsheet/src/exports/<area>.ts`, not in `src/index.ts`. `src/index-exports.test.ts` pins the surface; an intended change reruns it with `IFCSHEET_SURFACE_UPDATE=1` and commits `index-exports.snapshot.json`.

**The `ifcsheet` command line** (`packages/ifcsheet/src/`)
- A new command is a file in `cli-commands/` and one line in `cli-commands/index.ts`; `run` and the help text read that list.
- `cli-registry.test.ts` pins the help text and the answers to command lines that need no IFC file. Its fixtures are one file per section (`__fixtures__/cli-usage/<command>.usage.txt`, `<command>.help.txt`, `options.txt`) and one file per added command line (`__fixtures__/cli-argv/<name>.json`). `ARGV_CASES` and `cli-argv.main.json` are frozen: never append to them. To add a command line, write `__fixtures__/cli-argv/<name>.json` with just `{ "argv": [...] }`; then fill it in, or refresh every fixture after an intended change, with `IFCSHEET_CLI_FIXTURE_UPDATE=1 pnpm --filter @bimvoice/ifcsheet exec vitest run src/cli-registry.test.ts`, and review the diff.

**Translations** (`apps/viewer/src/i18n/`)
- New strings go in a NEW catalogue pair `catalogues/<feature>.en.ts` and `<feature>.ro.ts`, registered in the sub-barrel for its first letter: `barrels/en-a-e.ts`, `en-f-l.ts`, `en-m-r.ts`, `en-s-z.ts`; `barrels/ro-a-l.ts`, `ro-m-z.ts`.
- Never define a key in two catalogues of one language; `catalogues-disjoint.test.ts` fails on it.
- Romanian coverage is gated by `locales/ro.test.ts` and `face-keys.ts`. A plural needs `one`, `few` and `other` in `ro`.
- Every English key without Romanian is listed in `scripts/ro-coverage-baseline/<namespace>.txt` (one file per key namespace, the part before the first dot), and the list only shrinks. After translating keys, run `pnpm lint:ro-coverage-baseline` and commit what it rewrites; never edit those files by hand.

**A new project field** (`apps/viewer/src/project/fields/`; the steps are in the header of `index.ts`)
- Add `<key>.ts` (the field, its reader, its type via `declare module '../types' { interface ProjectFieldTypes { ... } }`) and `<key>.sample.ts`. In `<key>.ts`, register it: `export const registeredFields = [myField] as const;` and `declare module './registered' { interface RegisteredFieldKeys { myKey: true } }` (see `germany-permit.ts`). `registered.ts` finds the file; edit no list. Never add to `DOCUMENT_FIELD_DEFS` in `index.ts`: that list is frozen and `fields.test.ts` pins it.
- A field that a step of the drafting undo stack must put back (a standards pack, a dialog or a command sets it) carries `heldByUndo: true` on its definition (see `germanyLandField`). `FROZEN_STEP_FIELDS` in `drafting/draft-store.ts` is frozen; never add to it.
- Never reorder existing fields and never add to `read-order.ts`: key order decides which bad field a file is refused for and what `projectFingerprint` hashes.

**A new drawer section**
- Add a file in `apps/viewer/src/components/viewer/wall/drawer-sections/` and one import plus one entry in its `index.ts` (alphabetical). Do not edit `ProjectDrawer.tsx`.

**Import guards**
- `apps/viewer/src/drafting/session-imports.test.ts` forbids the drafting session from reaching the issue pipeline (`/issue/`), the sheet UI (`components/viewer/wall|sheets/`), `react-dom` and `fflate`. A shared registry such as `project/fields/` must import only light, pure modules: #347 tripped the guard through `issue/file.ts`.

## New source files
- MPL-2.0 header on every new file: see [`./LICENSE_HEADER.md`](./LICENSE_HEADER.md).

## Per-package notes
This root file is the shared contract; the closest `AGENTS.md` to an edited file also applies. Package-specific gotchas live in code-adjacent files: [`apps/viewer/AGENTS.md`](./apps/viewer/AGENTS.md), [`rust/AGENTS.md`](./rust/AGENTS.md), [`packages/geometry/AGENTS.md`](./packages/geometry/AGENTS.md), [`packages/collab/AGENTS.md`](./packages/collab/AGENTS.md), [`packages/collab-server/AGENTS.md`](./packages/collab-server/AGENTS.md). Add more as a package accumulates its own footguns.
