/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model's starting set laid out as sheets of shapes, ready for
 * `exportPdf` and `exportDxf`.
 */

import type { DefaultSet } from './default-set.js';
import type { ProjectView } from './document.js';
import type { OpenedModel } from './model.js';
import { activeColourScheme, resolveScheme, planHeights, type SchemeResult } from './colour-fills.js';
import { propertyValueReader } from './colour-scheme-read.js';
import { sheetGraphic, type SheetGraphic } from './sheet-graphic.js';
import { readStoreFacts } from './title-block-records.js';
import { projectTitleFields } from './title-block-sources.js';
import { northOfStore } from './true-north.js';
import { sheetFormat, type UnitsAndNumbers } from './units-and-numbers.js';
import { generateViewDrawings } from './view-drawings.js';
import { planOpeningSymbols, viewOpeningSymbols } from './plan-openings.js';
import type { OpeningSymbol } from './opening-symbols.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { planSymbolsOn, readPlanSymbols, withPlanSymbols } from './plan-symbols.js';
import { propertySetsOf, type JoineryProject } from './joinery-schedule.js';
import { PEN_TABLE, elementProperties, viewStyler, type PenTable } from './view-style.js';
import { surfaceFills, type SurfaceFill } from './surface-fills.js';
import { resolveViewGraphics } from './view-templates.js';
import type { SheetAnnotations } from './sheet-annotations.js';
import type { SheetSchedules } from './sheet-schedules.js';

export interface SheetGraphicsOptions {
  /** Cut each view's drawing from the meshes (default true); without it the sheets carry their frames and titles only. */
  drawings?: boolean;
  /** A view whose drawing could not be made; the sheet keeps its title. */
  onDrawingError?: (view: ProjectView, error: unknown) => void;
  /** The pens the drawings are drawn with (a graphic standard's, #365); default: `PEN_TABLE`, the pens the sheets have always printed with. */
  pens?: PenTable;
  /** The language the scale bars' figures are written in (default `en`); the project's "Units and numbers" setting (`doc.unitsAndNumbers`) applies on top. */
  locale?: string;
  /** The project's "Units and numbers" setting; default: the set document's. */
  units?: UnitsAndNumbers;
  /** The language the title blocks' dates are written in (`formatTitleBlockDate`); absent: as stored (ISO). */
  language?: string;
  /** A saved project's drafts, drawn on the viewports of the views they are on (#479, `projectSheetOptions`). */
  annotations?: SheetAnnotations;
  /** A saved project's list schedules, drawn where they are placed (#479, `projectSheetOptions`). */
  schedules?: SheetSchedules;
  /** The project's joinery catalogue, mapping and flips, which decide the symbol a door or window gets in a plan; default: none, so only what the model itself configures. */
  joinery?: JoineryProject;
}

/** An element's properties as a preset's property rules read them (`view-style.ts`), from a model opened here: each element's sets read once, only when a view's rules ask. */
export function headlessPropertiesOf(dataStore: NonNullable<OpenedModel['dataStore']>): (expressId: number) => Record<string, Record<string, unknown>> {
  const props = new Map<number, Record<string, Record<string, unknown>>>();
  return (id) => {
    let p = props.get(id);
    if (!p) props.set(id, (p = elementProperties(propertySetsOf({ dataStore, view: null }, id))));
    return p;
  };
}

/** The name of the IfcMaterial `materialId` is (its first attribute), for a template's material rules (#31). */
export function headlessMaterialOf(dataStore: NonNullable<OpenedModel['dataStore']>): (entityId: number, materialId: number) => string | null {
  return (_entityId, materialId) => {
    const raw = dataStore.getEntity(materialId)?.attributes?.[0];
    return typeof raw === 'string' && raw.trim() ? raw : null;
  };
}

/** Every sheet of `set` as shapes on its paper, in set order, the drawings cut from the building's meshes and clipped to the room the layout made for them. */
export async function sheetGraphics(set: DefaultSet, model: Pick<OpenedModel, 'buildingMeshes' | 'extent'> & Partial<Pick<OpenedModel, 'meshes' | 'dataStore' | 'coordinateInfo'>>, options: SheetGraphicsOptions = {}): Promise<SheetGraphic[]> {
  const { document: doc, levels } = set;
  const hung = new Set(doc.sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const drawings = options.drawings === false || !model.extent ? new Map()
    : await generateViewDrawings(doc.views.filter((v) => hung.has(v.id)), model.buildingMeshes, levels, model.extent, options.onDrawingError);
  // A plan draws the 2D symbol of an element that has one in place of its body (#489), as the app's plans do; a view can switch it off.
  const symbols = model.dataStore && drawings.size > 0 ? readPlanSymbols(model.dataStore, model.coordinateInfo).symbols : null;
  for (const view of symbols?.size ? doc.views : []) {
    const drawing = drawings.get(view.id);
    if (drawing && view.kind === 'plan' && planSymbolsOn(resolveViewGraphics(view, doc.viewTemplates))) drawings.set(view.id, withPlanSymbols(drawing, symbols!));
  }
  // A plan draws its doors and windows from their symbols (swing, operation, configured type, custom block), as the app's plans do (`plan-openings.ts`); an elevation or section draws its opening lines over them.
  const openings = new Map<string, readonly OpeningSymbol[]>();
  const dataStore = model.dataStore;
  for (const view of dataStore ? doc.views : []) {
    const drawing = drawings.get(view.id);
    if (!drawing || (view.kind !== 'plan' && view.kind !== 'elevation' && view.kind !== 'section')) continue;
    const sources = { live: { dataStore: dataStore!, view: null }, project: options.joinery ?? { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } };
    const graphics = resolveViewGraphics(view, doc.viewTemplates);
    // An elevation or section keeps its drawing, cut included, and the symbols go over it (`elevation-openings.ts`).
    openings.set(view.id, view.kind === 'plan' ? planOpeningSymbols(model.buildingMeshes, drawing.config.plane, sources, graphics, view.level) : viewOpeningSymbols(model.buildingMeshes, drawing.config.plane, drawing, sources, graphics));
  }
  // The views coloured by a property (#92): what each paints, from the same rules the app uses (`colour-fills.ts`).
  const schemes = new Map<string, SchemeResult>();
  for (const view of doc.views) {
    const scheme = activeColourScheme(view, doc.viewTemplates);
    const drawing = drawings.get(view.id);
    const valueOf = scheme && model.dataStore ? propertyValueReader({ dataStore: model.dataStore, view: null }, scheme.property) : null;
    if (!scheme || !drawing || !valueOf) continue;
    // The rooms are the spaces among the model's meshes: the building's own leave them out (a space is aggregated into its storey, not contained).
    schemes.set(view.id, resolveScheme(scheme, { meshes: model.meshes ?? model.buildingMeshes, cutPolygons: drawing.cutPolygons, plan: planHeights(view, levels), valueOf }));
  }
  // The drawings carry express ids; a view names its elements by GlobalId (#32, #33).
  const entities = model.dataStore?.entities;
  const globalIdOf = entities ? (id: number) => entities.getGlobalId(id) || undefined : undefined;
  const propertiesOf = model.dataStore ? headlessPropertiesOf(model.dataStore) : undefined;
  const materialOf = model.dataStore ? headlessMaterialOf(model.dataStore) : undefined;
  // The elevations and sections in the coloured style (#499): the surfaces the building's meshes show, minus what the view hides.
  const surfaces = new Map<string, SurfaceFill[]>();
  for (const view of doc.views) {
    const drawing = drawings.get(view.id);
    const graphics = resolveViewGraphics(view, doc.viewTemplates);
    if (!drawing || !graphics?.colouredSurfaces || (view.kind !== 'elevation' && view.kind !== 'section')) continue;
    const styler = viewStyler({ graphics, pens: options.pens ?? PEN_TABLE, globalIdOf, propertiesOf, materialOf });
    surfaces.set(view.id, surfaceFills(model.buildingMeshes, drawing.config, (entityId, ifcType) => styler.face({ entityId, ifcType }).visible));
  }
  // The title block's fields as the app fills them from the model (`title-block-sources.ts`): the phase, the roles, the organisation, the address.
  const projectFields = model.dataStore ? projectTitleFields(doc.titleBlock, doc.titleBlockSources, readStoreFacts(model.dataStore)) : undefined;
  const project = options.annotations || options.schedules ? { annotations: options.annotations, schedules: options.schedules } : undefined;
  return doc.sheets.map((sheet) => sheetGraphic(sheet, doc, drawings, model.extent, schemes, globalIdOf, propertiesOf, options.pens ?? PEN_TABLE, materialOf, projectFields, options.language, { north: model.dataStore ? northOfStore(model.dataStore) : null, locale: sheetFormat(options.locale ?? 'en', options.units ?? doc.unitsAndNumbers) }, project, surfaces, openings));
}
