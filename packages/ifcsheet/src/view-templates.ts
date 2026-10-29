/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * View templates (#44): one set of graphics, named, that many views follow.
 *
 * A view's effective graphics are layered, the later layer winning field by field:
 *
 *   1. its template's graphics (`ProjectViewTemplate.graphics`), by reference: change the template and every view that
 *      names it draws the change, nothing is copied into the view;
 *   2. the view's own `graphics`, which with a template are its overrides;
 *   3. for what a sheet draws, the viewport's hidden layers on top of the view's (`viewportHiddenLayers`).
 *
 * Single elements (#32, #33) are a layer above the first two, kept in the view's own graphics and read through
 * `resolveElementGraphics` (`element-graphics.ts`): template < category graphics < element override.
 *
 * `resolveViewGraphics` is the one place that does the first two; the web app, the headless sheets (PDF, DXF, the command
 * line) and the tests all call it, so they cannot disagree. A view with no template, or one whose template is gone, resolves to
 * its own `graphics` object unchanged: a project from before templates draws exactly as it did.
 *
 * What a template carries: the graphic override preset, the structural grid, the per-category graphics (visibility, line
 * colour, cut fill, line weight, cut hatch) and its class and material mapping (`styleRules`, #31). A house style of room fills (`colourScheme`, #92, #493: the property, the colours and the hatch per value) rides with it, and
 * the view's own scheme, when it has one, wins over the template's whole (`activeColourScheme`, `colour-fills.ts`). What it does not, and the view keeps whatever its template: `phases` (a survey or
 * demolition view is a purpose of one view, not a house style), and the drafting layers a view hides (layer ids belong to the
 * project's drafting, not to a kind of drawing).
 */

import type { CategoryGraphics, ProjectView, SheetViewport } from './document.js';
import type { ResolvedViewGraphics, ViewGraphics } from './view-graphics-types.js';

/** The kinds of view a template is for: the three the starting set draws. */
export type ViewTemplateKind = 'plan' | 'section' | 'elevation';
export const VIEW_TEMPLATE_KINDS: readonly ViewTemplateKind[] = ['plan', 'section', 'elevation'];

/** The part of a view's graphics a template carries. */
export type TemplateGraphics = Pick<ViewGraphics, 'presetId' | 'grid' | 'categories' | 'styleRules' | 'colourScheme' | 'detailLevel'>;

export interface ProjectViewTemplate {
  id: string;
  name: string;
  /** The kind of view it is for; the Wall offers a view the templates of its kind. */
  kind: ViewTemplateKind;
  graphics: TemplateGraphics;
}

/** The element categories a view can hide or restyle, and the IFC classes each holds (the Visibility / Graphics list). */
export const VIEW_CATEGORY_CLASSES = [
  { id: 'walls', classes: ['IfcWall', 'IfcWallStandardCase', 'IfcCurtainWall'] },
  { id: 'slabs', classes: ['IfcSlab'] },
  { id: 'roofs', classes: ['IfcRoof'] },
  { id: 'columns', classes: ['IfcColumn'] },
  { id: 'beams', classes: ['IfcBeam', 'IfcMember'] },
  { id: 'doors', classes: ['IfcDoor'] },
  { id: 'windows', classes: ['IfcWindow'] },
  { id: 'stairs', classes: ['IfcStair', 'IfcStairFlight', 'IfcRamp', 'IfcRampFlight'] },
  { id: 'railings', classes: ['IfcRailing'] },
  { id: 'spaces', classes: ['IfcSpace'] },
  { id: 'furniture', classes: ['IfcFurnishingElement', 'IfcFurniture'] },
  { id: 'other', classes: ['IfcBuildingElementProxy', 'IfcCovering', 'IfcPlate', 'IfcFooting', 'IfcPile'] },
] as const;

/** Upper-case IFC classes of the categories `graphics` hides. */
export function hiddenClassesOf(graphics: Pick<ViewGraphics, 'categories'> | undefined): Set<string> {
  const hidden = new Set<string>();
  for (const category of VIEW_CATEGORY_CLASSES) {
    if (graphics?.categories?.[category.id]?.visible === false) for (const k of category.classes) hidden.add(k.toUpperCase());
  }
  return hidden;
}

const NONE: ViewGraphics = Object.freeze({});
/** The last resolution per (view graphics, template graphics), so the same inputs give the same object: a memo keyed on it holds. */
const resolved = new WeakMap<object, WeakMap<object, ResolvedViewGraphics>>();

function mergeCategories(base: Record<string, CategoryGraphics> | undefined, over: Record<string, CategoryGraphics> | undefined): Record<string, CategoryGraphics> | undefined {
  if (!base) return over;
  if (!over) return base;
  const out: Record<string, CategoryGraphics> = { ...base };
  for (const [id, g] of Object.entries(over)) out[id] = { ...base[id], ...g };
  return out;
}

/** `template` and `own` layered, `own` winning field by field. */
function layered(template: TemplateGraphics, own: ViewGraphics | undefined): ResolvedViewGraphics {
  const categories = mergeCategories(template.categories, own?.categories);
  const grid = template.grid || own?.grid ? { ...template.grid, ...own?.grid } : undefined;
  const presetId = own?.presetId !== undefined ? own.presetId : template.presetId;
  const rules = template.styleRules?.length ? template.styleRules : undefined;
  // The view's own scheme replaces the template's whole: half of one property's colours under another's would mean nothing.
  const colourScheme = own?.colourScheme ?? template.colourScheme;
  const detailLevel = own?.detailLevel ?? template.detailLevel;
  return {
    ...(detailLevel ? { detailLevel } : {}),
    ...(grid ? { grid } : {}),
    ...(rules ? { styleRules: rules, ...(own?.categories ? { ownCategories: own.categories } : {}) } : {}),
    ...(presetId !== undefined ? { presetId } : {}),
    ...(own?.phases ? { phases: own.phases } : {}),
    ...(categories ? { categories } : {}),
    ...(colourScheme ? { colourScheme } : {}),
    // Single elements are the view's own, never a template's (#32, #33): they ride over whatever the template says.
    ...(own?.hiddenElements ? { hiddenElements: own.hiddenElements } : {}),
    ...(own?.elements ? { elements: own.elements } : {}),
    ...(own?.hiddenLines ? { hiddenLines: own.hiddenLines } : {}),
    ...(own?.usePlanSymbols === false ? { usePlanSymbols: false } : {}),
  };
}

/** `resolved` as a view's own graphics: without the field that exists only on a resolution (`ownCategories`), which its categories already hold. */
export function ownGraphicsOf(resolved: ResolvedViewGraphics | undefined): ViewGraphics | undefined {
  if (!resolved || !('ownCategories' in resolved)) return resolved;
  const { ownCategories: _own, ...rest } = resolved;
  return rest;
}

/** The template a view names, when the project has it. */
export function templateOf(view: Pick<ProjectView, 'templateId'> | undefined, templates: readonly ProjectViewTemplate[] | undefined): ProjectViewTemplate | undefined {
  return view?.templateId === undefined ? undefined : templates?.find((t) => t.id === view.templateId);
}

/**
 * The graphics `view` draws with: its template's, then its own over them. Without a template (none named, or the project no
 * longer has it) this is `view.graphics` itself.
 */
export function resolveViewGraphics(view: Pick<ProjectView, 'graphics' | 'templateId'> | undefined, templates: readonly ProjectViewTemplate[] | undefined): ResolvedViewGraphics | undefined {
  const template = templateOf(view, templates);
  if (!template) return view?.graphics;
  const own = view?.graphics ?? NONE;
  let byTemplate = resolved.get(own);
  if (!byTemplate) resolved.set(own, (byTemplate = new WeakMap()));
  let made = byTemplate.get(template.graphics);
  if (!made) byTemplate.set(template.graphics, (made = layered(template.graphics, view?.graphics)));
  return made;
}

/** The drafting layers a viewport shows its view without: the view's own, then the ones this viewport hides on its sheet. */
export function viewportHiddenLayers(view: Pick<ProjectView, 'hiddenLayers'> | undefined, viewport: Pick<SheetViewport, 'hiddenLayers'> | undefined): string[] {
  return [...new Set([...(view?.hiddenLayers ?? []), ...(viewport?.hiddenLayers ?? [])])];
}

/** What a view in a viewport draws with: the layered graphics and the layers hidden. */
export function resolveViewport(view: Pick<ProjectView, 'graphics' | 'templateId' | 'hiddenLayers'> | undefined, viewport: Pick<SheetViewport, 'hiddenLayers'> | undefined, templates: readonly ProjectViewTemplate[] | undefined): { graphics: ResolvedViewGraphics | undefined; hiddenLayers: string[] } {
  return { graphics: resolveViewGraphics(view, templates), hiddenLayers: viewportHiddenLayers(view, viewport) };
}

/** The parts of `graphics` a template carries. */
export function templateGraphicsOf(graphics: ViewGraphics | undefined): TemplateGraphics {
  const out: TemplateGraphics = {};
  if (graphics?.presetId !== undefined) out.presetId = graphics.presetId;
  if (graphics?.grid) out.grid = structuredClone(graphics.grid);
  if (graphics?.categories) out.categories = structuredClone(graphics.categories);
  if (graphics?.styleRules?.length) out.styleRules = structuredClone(graphics.styleRules);
  if (graphics?.colourScheme) out.colourScheme = structuredClone(graphics.colourScheme);
  if (graphics?.detailLevel) out.detailLevel = graphics.detailLevel;
  return out;
}

/** What a view keeps of its graphics when its overrides are reset: the parts no template carries, and its own colour scheme. */
export function untemplatedGraphics(graphics: ViewGraphics | undefined): ViewGraphics | undefined {
  const out: ViewGraphics = {};
  if (graphics?.phases) out.phases = graphics.phases;
  // Its own scheme stays with the view too: resetting its overrides or applying a template does not take its colours away (a template's scheme is the fallback under it).
  if (graphics?.colourScheme) out.colourScheme = graphics.colourScheme;
  // Single elements stay with the view: a template cannot carry them, so applying or resetting one never drops them (#32, #33).
  if (graphics?.hiddenElements) out.hiddenElements = graphics.hiddenElements;
  if (graphics?.elements) out.elements = graphics.elements;
  if (graphics?.hiddenLines) out.hiddenLines = graphics.hiddenLines;
  if (graphics?.usePlanSymbols === false) out.usePlanSymbols = false;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The kind of template a view takes, or null for a view that follows none (3D, drafting). */
export function templateKindOf(view: Pick<ProjectView, 'kind'>): ViewTemplateKind | null {
  return view.kind === 'plan' || view.kind === 'section' || view.kind === 'elevation' ? view.kind : null;
}

/**
 * The templates the starting set gives a new project: one per kind, named for what they hold (the names go through the
 * installed language, `nameOf`). They start from the default look, so a set that uses them draws as it did without.
 */
export function defaultViewTemplates(name: (kind: ViewTemplateKind) => string, newId: (kind: ViewTemplateKind) => string): ProjectViewTemplate[] {
  return VIEW_TEMPLATE_KINDS.map((kind) => ({ id: newId(kind), name: name(kind), kind, graphics: {} }));
}

/** `views` with the starting templates named on the plans, sections and elevations that follow none yet (details and interior elevations too: they are drawings of the same kind). */
export function assignDefaultTemplates<V extends ProjectView>(views: readonly V[], templates: readonly ProjectViewTemplate[]): V[] {
  return views.map((v) => {
    const kind = templateKindOf(v);
    const template = kind && v.templateId === undefined ? templates.find((t) => t.kind === kind) : undefined;
    return template ? { ...v, templateId: template.id } : v;
  });
}
