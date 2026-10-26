/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `@bimvoice/ifcsheet/headless`: the chain from an IFC file to drawing-set
 * files, without a browser. Open the model (parser and wasm geometry), lay out
 * its starting set with `generateDefaultSet` from the main entry, cut each
 * view's drawing, lay each sheet out as shapes and write them as PDF and DXF.
 * Kept apart from the main entry so the layout's clients do not load the
 * parser, the geometry engine or the writers.
 */

export { openModel, type FarElementInfo, type OpenedModel, type OpenModelOptions } from './model.js';
export { generateViewDrawings, sectionConfigFor } from './view-drawings.js';
export { sheetGraphic, type Polyline, type SheetGraphic, type SheetImage, type SheetPen, type SheetText } from './sheet-graphic.js';
export { headlessMaterialOf, headlessPropertiesOf, sheetGraphics, type SheetGraphicsOptions } from './set-sheets.js';
export { exportDxf, exportPdf } from './export.js';
export { IFC_GUID, isPhysicalElement, readModelFacts, readinessOfModel, type FactSource } from './readiness-read.js';
export { byggesaksbimDocument, byggesaksbimReadiness, byggesaksbimReport } from './byggesaksbim/run.js';
export { areaScaleOf, readRooms, type RoomsRead } from './room-read.js';
export * from './project.js';
export { createHeadlessListProvider } from './list-provider.js';
export { listScheduleCsv, listScheduleTableOn, listTableIsEmpty, runListScheduleOn, type HeadlessListOptions } from './list-headless.js';
