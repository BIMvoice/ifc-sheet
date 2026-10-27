# @bimvoice/ifcsheet

The IfcSheet drawing-set engine: the project document, the starting set of views and sheets a model opens with, and PDF and DXF export, without a browser. The IfcSheet web app (`apps/viewer`) is a client of it.

Not published yet (`private`). The design and what is still to move are in [`docs/architecture/ifcsheet-engine.md`](../../docs/architecture/ifcsheet-engine.md).

## From an IFC to a drawing set, in Node

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { generateDefaultSet } from '@bimvoice/ifcsheet';
import { exportDxf, exportPdf, openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';

const model = await openModel(new Uint8Array(readFileSync('house.ifc')));
const set = generateDefaultSet(model);
if (!set) throw new Error('The model has no geometry to lay a set out on.');

const sheets = await sheetGraphics(set, model);
writeFileSync('house.pdf', await exportPdf(sheets));
for (const sheet of sheets) writeFileSync(`${sheet.number}.dxf`, exportDxf(sheet));
writeFileSync('house.drawing-set.json', JSON.stringify(set.document, null, 2));
```

`openModel` parses the file and meshes it with the wasm geometry engine (`@ifc-lite/wasm`, built with `pnpm build:wasm` or fetched with `pnpm build:wasm:fetch`). `generateDefaultSet` lays out the same views and sheets the Wall makes when the model opens: a plan per level, the four elevations, the two proposed sections, on sheets numbered A-101, A-201… `set.notes` says what the person should know (no storeys, drawings larger than their paper).

## The `ifcsheet` command

```sh
ifcsheet build house.ifc --out set.pdf                       # one PDF, a page per sheet
ifcsheet build house.ifc --out out/set.pdf --dxf out/dxf     # plus A-101.dxf, A-201.dxf, ...
ifcsheet build house.ifc --out set.pdf --name "House Alpha"  # project name in the title blocks
ifcsheet build house.ifc --out set.pdf --template office.bvset # the sheets made by an office's set template (#21)
ifcsheet build house.ifc --out set.pdf --standard ro            # the Romanian pack's pens and title block (#365), or --standard de for the German pack; --project uses the project's own
ifcsheet check house.ifc                                     # what the model lacks, in plain English
ifcsheet check house.ifc --json                              # the same as JSON
ifcsheet check house.ifc --project house.ifclite-project.json  # also the project's split schedules: an element in two parts, or in none
ifcsheet materials house.ifc --project house.ifclite-project.json  # how each material draws where a view cuts it, the project's table applied (--json for JSON)
ifcsheet boq house.ifc --project house.ifclite-project.json    # the bill of quantities (antemasuratoare): each article's total in its unit; --csv, --json, --detail, --locale ro
ifcsheet list house.ifc --project house.ifclite-project.json --schedule walls    # a schedule built from the Lists engine: the app's rows and totals; --csv, --json, --locale ro
ifcsheet --help
```

Exit code 0 on success, 1 when the work failed (unreadable file, a model with no geometry), 2 for a wrong command line. `build` needs the wasm bundle, as `openModel` does; `check` does not. `check` exits 0 when nothing would weaken the drawings and 1 when something would (or the file cannot be read): the findings are the model-readiness report of the app, one implementation (`readiness.ts`). `--project` (#260) reads a saved `.ifclite-project.json`: its schedules and sub-reports, and the joinery catalogue and symbol mapping the schedule rows depend on; the rows are built by `joineryScheduleData`, the one function the app also calls to list a model's doors and windows, and the findings carry the app's sentences. What it cannot see: edits made in the app and not yet exported to the IFC (the CLI reads the file as saved), and the project's title block, views and sheets (no finding reads them yet). `--template` (#21) makes the sheets by the rules of a `.bvset` file saved from a project in the app (`set-template.ts`, `set-template-apply.ts`, `set-template-file.ts`): a plan per storey counted from the ground storey, the elevations by direction, the sections by place, each sheet's paper and scale. A rule the model cannot meet is skipped and printed, a storey the template did not foresee is laid out as the automatic set lays it out, and the app and the command line run the same `applySetTemplate`. The schedules, title block layout and tag fields a template carries are added by the app, not by the command line. `build --project` draws with the project's graphic standard (its pens) and title block layout, and `build --standard ro` or `--standard de` (#365) applies the Romanian or the German pack, the definition the app's "Install standard" applies (`standard-pack.ts`, `graphic-standard.ts`, `title-block-ro.ts`): the pens and the cartuș with Romanian captions (German: the pens and the standard layout with German captions); `--standard` wins over the project's own, an unknown id fails with the known ids, and without either the output is byte for byte what it was. The pack's number format and sheet numbering are not applied by the command line. The PDF's frame pen is the engine's own (0.5) whatever the standard. `boq` (#75) adds up the project's bill-of-quantities articles (`boqArticles`, entered in the app: IfcSheet ships no norm or article code) over the quantities the model declares, with `computeBoq`, the one function the app calls too. A unit that is not the quantity's is refused (exit 1) in words; an element that does not declare the quantity is named and left out of the sum, never counted as zero. The XLSX is the app's (its one writer); the command line prints text, `--csv` or `--json`, and reads the `.ifclite-project.json` sidecar, not a `.bvproj` package. The package is private, so run the built bin: `pnpm --filter @bimvoice/ifcsheet build`, then `node packages/ifcsheet/dist/bin.js build ...`.

## What the output is today

- **PDF**: one page per sheet at its paper size, vector lines and text in Inter (shipped in `fonts/`, SIL Open Font License; ș and ț print), true to scale. Each drawing is clipped to its viewport. Unstyled: no pens, hatches, symbols or annotation yet.
- **DXF**: one R12 file per sheet in paper millimetres, with the frame, the title block's lines and each drawing's linework on their own layers. No text yet.

## Names

Names the engine gives (sheet names, view names) are English. Install another language with `setNameResolver`.

## Tests

`pnpm --filter @bimvoice/ifcsheet test`. The FZK-Haus tests (headless chain and `ifcsheet build`) need `pnpm fixtures` and the wasm build, and skips with a message without them.

### Golden sheets

`src/golden-sheets.models.test.ts` regenerates the starting drawing set of AC20-FZK-Haus and bloc-p4 and compares a digest of it with `benchmark/accepted/<model>.json`: per sheet the number, name, paper, scales, the count, point count and a hash of the path data (rounded to 0.01 mm) of the frame, the cut, the lines and each pen, a rounded bounding box and the text; per model the storeys, the room count, Au and its per-level totals. A change fails the test with one line per field, `sheet A-201: pens.SEEN stroke=#000000 fill=- #1.width: 0.25 -> 0.3`. When the change is intended, run `pnpm --filter @bimvoice/ifcsheet benchmark:update` and commit the JSON diff. More models (Skolebygg, Duplex, Schependomlaan) can be added locally with `IFCSHEET_BENCHMARK_MODELS=name=/path/model.ifc,...`; CI does not set it.
