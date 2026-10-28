# Agent reference: detail moved out of AGENTS.md

`AGENTS.md` has a byte budget (`scripts/agents-md-budget.txt`). The long detail below was moved here verbatim; each rule keeps a one-line statement in `AGENTS.md` that links to its section.

## Typecheck covers test sources (#2457)

Typecheck: `pnpm typecheck` (turbo, wasm-free: no Rust toolchain needed). This covers **test sources too**, which for a long time it did not: the root `tsconfig.json` excludes `**/*.test.ts` so tests never reach `dist/`, every `packages/*` config inherits that through `tsconfig.packages.json`, and `exclude` filters `include` — so a package's `"include": ["src/**/*"]` cannot pull its own tests back and 652 of 960 test files were in no typecheck program at all (#2457). Since vitest and `tsx --test` transpile per file without checking types, an unchecked test still *runs* while everything it asserts at type level (`expectTypeOf`, `@ts-expect-error`, a typed fixture) is silently unverified. Each package's `typecheck` script therefore runs `scripts/typecheck-tests.mjs`, which derives a no-emit test program from that package's own tsconfig and lists the test files under `files` — unlike `include`, `files` is not filtered by `exclude`. The generated `<pkg>/tsconfig.tests.json` is gitignored (rebuilt every run); the shared emit-off overrides live in `tsconfig.tests.base.json`. Do not "fix" a test-only type error by putting tests back into a package's emit tsconfig — that ships them to `dist/`.

## Bounding walks over file-supplied references

Entity references come from the file, so their shape is exporter- and
attacker-controlled. An unbounded recursive walk over one self-referential
entity dies by `SIGABRT`, which is not a catchable panic: nothing upstream turns
it into a load error, and in the wasm geometry worker it takes down the
instance. #2866 found seven such sites.

The three mechanisms are not interchangeable, and each alone leaves a hole:

- a **depth cap** bounds one path's LENGTH, not its breadth. `k` items each
  leading back into a cycle cost `O(k^depth)`, turning an abort into a hang
  (measured 7.21s at k=3). A hang is worse: nothing reports it.
- a **visited set** bounds cycles and revisits. While the walk still recurses it
  does NOT bound a long *acyclic* chain: every insert succeeds, the set never
  fires, and the stack still overflows.
- a **work budget** bounds acyclic DAG fan-out, which neither of the others
  sees. A DAG where every branch succeeds never errors and never repeats an id;
  it just emits `2^levels` outputs.

Choose the visited set's SCOPE by what the walk returns:

- **global / memoising** when the result is a pure function of the id (a colour
  is determined by item id plus style map). Safe and strictly stronger: it kills
  fan-out outright.
- **path-scoped** (insert on the way in, remove on the way out) when output
  ACCUMULATES. A boolean operand tree is a DAG and geometry accumulates, so the
  same node down two branches is two real pieces of geometry. A global set
  silently drops the second: **missing geometry, not a cycle guard**, and no
  termination test notices.

Prefer making the walk **iterative** over adding a cap: with no stack to consume
there is nothing left for a cap to protect, and the visited set becomes
sufficient alone. A cap tight enough to stop a cycle usually rejects legitimate
input — #960 records Revit `FirstOperand` chains 42 nodes deep.

Reuse the shared bound where the chain is shared: `ifc_lite_core::limits`.

A guard that both ACTS and REPORTS has a two-part contract — bound the work, and
report that you bounded it. Mutate the halves separately; they fail differently
(a missing bound hangs, a missing report returns a truncated success).

`scripts/check-refwalk-guards.mjs` (CI) enforces the *presence* of a guard, not
its choice: it fails when a self- or mutually-recursive function, or a
cursor-chasing loop, reaches `decode_by_id`/`resolve_ref`/`resolve_ref_list`
under `rust/geometry/src`, `rust/processing/src` or `rust/wasm-bindings/src`
with no visited set, path stack or depth cap in scope. Five of the six #2866
fixes are detected at their parent commit and clear at the fix; the sixth
(#2870) spans two files and is missed, which is the documented blind spot. Which
guard is right stays a review question — everything above still applies. The
allowlist is `scripts/refwalk-guard-allowlist.txt` and is empty.

## Wiring a new gate under `scripts/`

  `scripts/check-test-wiring.mjs` audits `scripts/` — every `check-*` / `verify-*` file at **any depth** and in `.mjs`, `.js` or `.cjs` (`verify-npm-publish.js` and `check-benchmark-regression.js` are real gates). It accepts exactly the wiring this repo actually uses: a `.github/workflows/` step running `node scripts/<gate>.mjs` (the common case, see the `node-tests` job); a root `package.json` script a workflow reaches through `pnpm <name>`, possibly transitively (`check-changesets.mjs` <- `lint` <- the Lint job); a **workspace** package's script reached by a turbo task (`check-tla-chunk-await.mjs` is the viewer `build` script's tail, deliberately, so Vercel runs it too and not only CI); or a file that an already-reached script imports or spawns (below the top level a `verify-*` name is as often a module as a gate, and a file a running gate runs does run). A root `package.json` entry no workflow ever calls executes exactly as often as no entry at all, and is rejected.

  `scripts/*.test.mjs` is audited separately from the gate itself. The `node --test` catch-all in `test.yml` is per-directory, because a shell glob has no `**`, and a gate whose test runs while its script never executes is still the #3062 failure.

  A script that genuinely should not run in CI declares `@unwired-by-design <reason>` in its own header and is then listed in the checker's OK output rather than hidden. The marker is a blanket escape and nothing judges the reason's quality, so its only safeguard is that every declaration is printed and lives in the diff. STATED HOLES: the check is lexical and does not evaluate workflow expressions, so a gate whose only step sits in a job with `if: false` still counts as wired; and `audit-*.mjs` reports rather than gates, so it is not demanded.

## Testing a viewer component

- **Testing a viewer component.** It is mountable — including one that reads `useViewerStore`, which is a module-level Zustand store you seed with `setState`. Three test files claimed otherwise for months; the real blockers were two Vite-isms, fixed once in `apps/viewer/src/test/`. The recipe:
  ```tsx
  import '@/test/setup-dom.js';               // MUST be first: registers happy-dom
  import { installLayout } from '@/test/dom-layout.js';
  installLayout();                            // only if it virtualizes or measures
  import { render, click, advance, cleanup } from '@/test/render.js';
  import { fixtureModel, fixtureModels } from '@/test/store-fixture.js';

  useViewerStore.setState({ ...fixtureModels(fixtureModel('m', { idOffset: 1_000_000 })) });
  const ui = render(<YourPanel />);
  click(/* what a user clicks */);
  assert.equal(useViewerStore.getState().selectedEntityId, expected);
  ```
  `~icons/*` (unplugin-icons virtual modules) and `import.meta.env` are handled by `src/test/vite-module-hooks.mjs`, registered from the `--import` flag in the viewer's `test` script — it cannot be registered from inside a test file, because module resolution finishes before any module body runs. `installLayout()` also makes `ResizeObserver` deliver an entry: happy-dom ships the class but never fires it, which is why a virtualized list otherwise renders zero rows.
  Viewer mounting (#2434): `RibbonToolbar` and its tabs mount as-is; `FileTab` needs `fileCommands`; `PropertiesPanel` and `ModelQuery` need a real parsed store, not a cast stub (`new IfcParser().parseColumnar(...)` over inline STEP); `ViewportContainer` needs stubbed `navigator.gpu` and a loaded model, else it shows "WebGPU Not Available". Radix dropdowns open on `pointerdown` then `click`, and portal to `document.body`. `RibbonContentLargeButton` names itself `tooltip ?? contentLabel`; registered `RibbonCommandLargeButton` uses the registry label as its name and tooltip as its description. Assert visible and accessible labels separately.
  Assert behavior, not wiring: an unreachable component, ignored hook result, or uncalled handler can look correct in source. #2434 tests that only found a component survived deleting it; assert its values (one such bug shipped until mutation testing).
