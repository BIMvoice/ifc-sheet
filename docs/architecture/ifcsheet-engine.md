# The IfcSheet engine as a package

Issue #163, part of #162. This note says what lives in `packages/ifcsheet` (`@bimvoice/ifcsheet`), what stays in the web app, and how the project document is the contract between them. It describes the first slice and lists what is left.

## Why

Until this slice, the drawing-set logic lived in `apps/viewer/src`, so only the web app could use it. A CLI (#164) and MCP tools (#165) need the same logic without a browser. The package is that logic. The web app becomes one client of it, scripts and agents are others.

## What the package holds

| Part | Files | What it does |
| --- | --- | --- |
| The contract | `document.ts`, `sheet-types.ts`, `view-graphics-types.ts`, `view-3d-types.ts` | The drawing-set part of the project document: levels, views (plan, section, elevation, 3D, drafting), sheets, viewports, paper, frame, templates, numbering. The app's `ProjectDocument` extends the engine's. |
| Pure layout | `paper.ts`, `sheet-frame.ts`, `sheet-templates.ts`, `numbering.ts`, `viewport-fit.ts`, `view-defaults.ts`, `set-defaults.ts`, `section-proposals.ts`, `section-plane.ts`, `drawing-set.ts`, `entity-bounds.ts` | Paper sizes, the frame and title block rectangles, numbering schemes, the default views, elevation planes and depths, the proposed sections, the starting set's sheets and scales. Data in, data out: no React, no stores, no DOM. Moved from `apps/viewer/src/project/` unchanged apart from imports and the names seam. |
| Names | `names.ts` | The names the engine gives what it makes (`Floor plans`, `South Elevation`, `Section A-A`), in English. A client installs its own resolver. |
| The starting set | `default-set.ts` | The views and sheets the Wall makes when a model opens on an empty project, from the model's storeys, extent, rooms and stairs. Pure. |
| Headless chain (`@bimvoice/ifcsheet/headless`) | `model.ts`, `view-drawings.ts`, `sheet-graphic.ts`, `set-sheets.ts`, `export.ts` | Open an IFC in Node, cut each view's drawing, lay each sheet out as shapes, write one PDF and a DXF per sheet. |

## What stays in the app

The UI and its state: React components, the zustand stores (`project-store.ts`, the viewer store), undo, autosave, the Wall, the drafting session, the sheet SVG the browser renders, and the browser exports (`issue/pdf-build.ts` through svg2pdf, `sheet-dxf.ts` from the sheet SVG). Store actions such as `ensureDrawingSet`, `hangView` and `setGroupScale` stay in `project/drawing-set-actions.ts`: each reads the store, calls the engine's pure layout, and writes the result back as one store update.

The old module paths (`project/drawing-set.ts`, `project/numbering.ts`, `project/paper.ts` and the others above) are now one-file re-exports of the package, so no importer in the app changed. `project/types.ts` re-exports the engine's types and adds what only the app keeps (drafts, styles, issues and so on).

## The public API

<!-- docs-check: skip -->
```ts
import { generateDefaultSet } from '@bimvoice/ifcsheet';
import { exportDxf, exportPdf, openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';

const model = await openModel(bytes);            // parser + wasm geometry: storeys, extent, rooms and stairs
const set = generateDefaultSet(model);           // { document: ProjectDocument, levels, notes }
const sheets = await sheetGraphics(set, model);  // each sheet as shapes on its paper, mm
const pdf = await exportPdf(sheets);             // one PDF, a page per sheet at its paper size
const dxf = sheets.map(exportDxf);               // one DXF per sheet, paper mm
```

`ProjectDocument` (engine) is the contract: `name`, `models`, `views`, `sheets`, `titleBlock`, `sheetTemplates`, `seriesTemplates`, `sheetNumbering`. It is plain JSON. Views and sheets refer to each other by id, and levels name their storeys by IFC GlobalId.

The main entry holds the contract, the pure layout and `generateDefaultSet`; `@bimvoice/ifcsheet/headless` holds what loads the parser, the wasm geometry engine, the section generator and the writers, so the web app, which uses the layout only, loads none of them through the package.

The pure layout functions (`buildDrawingSet`, `withViewHung`, `defaultViews`, `numberSheets`, `proposeSections` and the rest) are exported too, for a client that keeps its own state, as the app does.

## Seams

- **Names.** `drawing-set.ts` and `view-defaults.ts` used the app's translation catalogue directly. They now call `nameOf`, which resolves through whatever the client installed with `setNameResolver`. The app installs its catalogue in `i18n/registry.ts`, and its English `names.*` catalogue spreads the engine's `ENGINE_NAMES_EN`, so there is one copy of the English text. Headless output is English by default.
- **The scale reason.** `sheetScaleReason` returns a `Reason` whose key is one of the engine's three `wall.reason.*` keys. The app's `Reason` (any catalogue key) stays in the app's `project/drawing-set.ts`, and the engine's is assignable to it.
- **The section plane.** The plane through a line drawn on a plan (`sectionPlaneThrough`) is the engine's. The app's SECTION command maps the plan's drawing points to the world (`drawingToWorld`) and calls it. The headless set calls it with world points directly.
- **Entity bounds.** `createEntityBoundsLookup`, `unionEntityBounds` and their helpers moved out of `utils/viewportUtils.ts`, which re-exports them. The set's extent and the rooms and stairs of the proposed sections are measured with the same code in both places.
- **Model reads.** The app reads storeys, rooms and stairs from its stores (`model-levels.ts`, `model-rooms.ts`). `openModel` makes the same reads over one parsed model, through the same accessors (`iterateEffectiveEntities`, the spatial hierarchy).

## How the two starts are held equal

`generateDefaultSet` follows `ensureDrawingSet` step by step for a project that has no views yet: the default views, a plan per level, the four elevations with their planes and depths, each plan's scale, the two proposed sections, then the sheets. Both call the same pure layout. They are still two orchestrations, one over the store and one over a list. `apps/viewer/src/project/engine-default-set.fzk.test.ts` runs both on AC20-FZK-Haus and requires the same extent, the same sheets (number, name, series, paper, viewports with view, scale and place) and the same views (planes, depths, scales, levels). Turning off the plan scales, the elevation depths or the second section in the engine, or the second section in the app, fails it (checked by hand). For FZK-Haus the default views already hold a plan per level, so the step that adds a missing plan is not exercised by this model.

## What runs headless, and what does not yet

- **PDF.** jsPDF runs in Node. `exportPdf` draws vector lines and text in the standard Helvetica font, one page per sheet at its paper size. It does not use svg2pdf or a canvas. It is not yet the app's PDF: no pens, hatches, symbols, annotation, layers, embedded fonts or archival metadata. Those come from the sheet SVG, which only the browser renders today.
- **DXF.** `exportDxf` writes R12 through `@ifc-lite/drawing-2d`'s exporter: the frame, the title block's lines and each drawing's cut outlines and visible lines, in paper millimetres. Text (title block fields, drawing titles) is not in the DXF yet. The app's R2000 writer (`components/viewer/sheets/dxf-r2000.ts`) needs its 2,800-line skeleton file shipped as a package asset before it can move.
- **Drawings.** Cut by the section generator, unstyled: cut faces and visible lines only, no hidden lines, no styling.
- **Raster views.** A 3D view hangs on no sheet of the starting set, so the headless chain has no raster to make. A raster capture needs a WebGPU canvas and stays in the browser.

## Not the same as the app yet

- `openModel` reads each level's floor from its `IfcBuildingStorey.Elevation`. The app also derives the floor in the drawing frame (`floorY`, from the storey's placement chain, `model-levels.ts`). Levels are matched and the set laid out by elevation in both, so the set is the same; a plan's cut height can differ in a model whose storeys sit in a shifted placement.
- When no storey holds geometry, the app measures the main body of the model (`draft-set/body.ts`, `mainBodyExtent`). `openModel` returns no extent and `generateDefaultSet` returns `null`.
- The title block prints the fields the engine knows: the project's typed or model name, sheet number and name, scale, date. Reading the title block from the model (`title-block-model.ts`, `title-block-sources.ts`) is a follow-up.

## Follow-ups

1. Move the app's sheet composition (the sheet SVG: frame, title block, viewports with styled drawings, symbols, annotation) into the package as a pure SVG writer. Then the browser and headless exports both print it, through svg2pdf in the browser and a Node SVG-to-PDF path headless.
2. Move the R2000 DXF writer with CAD layers and text, with its skeleton as a package asset.
3. Fold `ensureDrawingSet` onto a pure planner in the package, so the store action applies the planner's result and the two orchestrations become one.
4. Move the title block's model reads (`title-block-sources.ts`, the `ModelFacts` reader) and the storey floor in the drawing frame (`floorY`).
5. Move project-file reading and writing (`project-file.ts`, `DOCUMENT_FIELDS`, migrations), so a headless client reads and writes the same `.ifclite-project.json` the app saves.
6. Move the viewer tests of the moved modules (`numbering.test.ts`, `drawing-set.test.ts`, `view-defaults.test.ts` and the others) into the package once they no longer need the app's stores.
7. Publish the package (`private` is true today, so no changeset or API-surface snapshot yet).

## What the CLI and MCP slices build on

- `openModel`, `generateDefaultSet`, `sheetGraphics`, `exportPdf` and `exportDxf` are the `ifcsheet build` command (#164) almost as they stand: IFC in, PDF and DXF files out.
- `generateDefaultSet`'s `notes` (no storeys, a group larger than its paper) are what `ifcsheet check` and an agent report.
- The `ProjectDocument` it returns is plain JSON addressed by ids and IFC GlobalIds: an MCP tool (#165) can return it, and accept a changed one. The pure layout functions (`withViewHung`, `numberSheets`, `scaleOn`, `sheetScaleReason`) are the operations a tool can preview on a copy of the document before it is applied.
