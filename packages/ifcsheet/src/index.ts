/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @bimvoice/ifcsheet: the IfcSheet drawing-set engine.
 *
 * The project document's drawing-set part is the contract (`document.ts`).
 * The pure layout makes a set from views and a model's extent; the headless
 * chain opens an IFC, lays out the starting set and writes it as PDF and DXF,
 * in Node or in the browser. The web app (`apps/viewer`) is a client: its
 * stores call into these functions and keep the UI state.
 *
 *     import { generateDefaultSet } from '@bimvoice/ifcsheet';
 *     import { exportDxf, exportPdf, openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';
 *
 *     const model = await openModel(bytes);
 *     const set = generateDefaultSet(model);
 *     const sheets = await sheetGraphics(set, model);
 *     const pdf = await exportPdf(sheets);
 *     const dxf = sheets.map(exportDxf);
 *
 * This file only lists the sub-barrels in `exports/`. A feature adds its exports to the barrel of its own area
 * (create a new `exports/<area>.ts` and one line here if none fits), so concurrent PRs do not collide on this list.
 * `src/index-exports.test.ts` pins the whole surface: an intended API change updates its snapshot, and a name two
 * barrels both export (which `export *` drops silently) fails it.
 */

export * from './exports/views.js';
export * from './exports/schedules.js';
export * from './exports/names.js';
export * from './exports/title-block.js';
export * from './exports/standards.js';
export * from './exports/layout.js';
export * from './exports/set-templates.js';
export * from './exports/quantities.js';
export * from './exports/project-set.js';
export * from './exports/opening-symbols.js';
