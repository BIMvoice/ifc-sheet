/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Annotate the set" on a model opened headlessly (#707, steps 6 and 7): the drawings `generateViewDrawings` cuts go to
 * `annotateViews`, with the commands' inputs read from the model's meshes, spaces and labels (the list provider the lists
 * and schedules read). What `ifcsheet build --annotate` and the MCP tool `ifcsheet_annotate` call, so the two draft the same
 * dimensions, tags and level marks the app's "Annotate the set" does. The drafts come back to be printed as the project's
 * (`withDrafts`, `annotationsOf`).
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { QuantityType, type QuantitySet } from '@ifc-lite/data';
import { extractAllEntityAttributes } from '@ifc-lite/parser';
import type { DefaultSet } from '../default-set.js';
import { annotationRects } from '../dimall/annotation-rects.js';
import { openingObstacles, type ObstacleBox } from '../dimall/plan-obstacles.js';
import { gridAxesOfModel, gridObstacles, gridShapesOf } from '../grid-overlay.js';
import { DEFAULT_VIEW_SCALE } from '../viewport-annotation.js';
import { planOpeningSymbols } from '../plan-openings.js';
import { resolveViewGraphics } from '../view-templates.js';
import { tableMeasure, type DimAllMeasure } from '../dimall/measure.js';
import { planParts } from '../dimall/parts.js';
import { DEFAULT_DIM_STYLE } from '../draft-styles.js';
import { DEFAULT_TEXT_STYLE } from '../draft-look.js';
import type { DraftEntity, DraftLayer } from '../draft-types.js';
import { DEFAULT_DRAFT_LAYER } from '../default-draft-layer.js';
import type { PlanProjectView, ProjectDocument, ProjectView } from '../document.js';
import { freshProjectId } from '../ids.js';
import type { LabelElement, QuantitySetLike } from '../labels/label-resolve.js';
import { viewElements as viewElementsOf } from '../labels/view-elements.js';
import { createHeadlessListProvider } from '../list-provider.js';
import type { OpenedModel } from '../model.js';
import { storeyFloorsOf } from '../plan-projection.js';
import type { SheetAnnotations } from '../sheet-annotations.js';
import { paperUnitFor, styledParamsIn, styleBookOf } from '../style-fit.js';
import { roomsOfPlan } from '../tagall/rooms.js';
import { TAGALL_TYPES, type TagParts } from '../tagall/types.js';
import { elementMark, markIndex, markKey } from '../element-mark.js';
import { DEFAULT_JOINERY_MAPPING } from '../joinery-mapping.js';
import type { JoinerySpec } from '@ifc-lite/create';
import type { JoineryMapping } from '../joinery-mapping.js';
import type { JoineryCellOverride } from '../joinery-overrides.js';
import { joineryScheduleData } from '../joinery-schedule.js';
import { scheduleModelsOf } from '../schedule-models.js';
import type { SheetLocale } from '../units-and-numbers.js';
import { generateViewDrawings } from '../view-drawings.js';
import type { AnnotateChoices } from './choices.js';
import { annotateViews, type AnnotateReaders, type AnnotateView, type AnnotateViewsResult, type ReadCall } from './views.js';

export { DEFAULT_DRAFT_LAYER };

type AnnotateModel = Pick<OpenedModel, 'buildingMeshes' | 'meshes' | 'extent' | 'dataStore' | 'coordinateInfo'>;
type AnnotatedView = Extract<ProjectView, { kind: 'plan' | 'elevation' | 'section' }>;
type HeadlessView = AnnotateView & { scale?: number | undefined };

export interface HeadlessAnnotateInput {
  model: AnnotateModel;
  set: Pick<DefaultSet, 'document' | 'levels'>;
  choices: AnnotateChoices;
  /** Which labels TAGALL places; absent: every kind. */
  tagParts?: TagParts;
  /** The set's drafts before the run; a command adds only what is missing from them. */
  existing?: readonly DraftEntity[];
  /** Only these views (by id); absent: every plan, elevation and section the choices give a command. */
  viewIds?: ReadonlySet<string>;
  /** The joinery catalogue, symbol mapping and typed marks the schedule numbers the openings by; default: the model's own types and the default mapping. */
  joinery?: { joineryTypes?: readonly JoinerySpec[]; joineryMapping?: JoineryMapping; joineryOverrides?: readonly JoineryCellOverride[] };
  /** The language of the labels and figures; default English. */
  locale?: SheetLocale;
  /** Where ids come from; default fresh project ids. */
  newId?: () => string;
}

export interface HeadlessAnnotateResult extends AnnotateViewsResult {
  /** The set's drafts after the run: the ones it had (moved ones in their new place) and the ones the run added. */
  all: DraftEntity[];
}

const withLengths = (set: QuantitySet): QuantitySetLike => ({
  name: set.name,
  quantities: set.quantities.map((q) => ({ name: q.name, value: q.value, length: q.type === QuantityType.Length })),
});

/** An element of the model as a label reads it, by GlobalId, from the same list provider the schedules use. */
function elementReader(dataStore: NonNullable<AnnotateModel['dataStore']>, renderIdOf: (guid: string) => number | undefined, markOf: (id: number, tag: string) => string): (guid: string) => LabelElement | null {
  const p = createHeadlessListProvider(dataStore);
  const longNames = new Map<number, string>();
  const longNameOf = (id: number): string => {
    let name = longNames.get(id);
    if (name === undefined) {
      const value = dataStore.source?.length && dataStore.entityIndex ? extractAllEntityAttributes(dataStore, id).find((a) => a.name === 'LongName')?.value : undefined;
      longNames.set(id, (name = typeof value === 'string' ? value : ''));
    }
    return name;
  };
  return (guid) => {
    const id = renderIdOf(guid);
    if (id === undefined) return null;
    return {
      attribute: (name) => {
        switch (name) {
          case 'Name': return p.getEntityName(id);
          case 'Tag': return p.getEntityTag(id);
          case 'LongName': return longNameOf(id);
          case 'RoomNumber': return longNameOf(id) ? p.getEntityName(id) : '';
          case 'Mark': return markOf(id, p.getEntityTag(id));
          case 'TagName': return '';
          case 'ObjectType': return p.getEntityObjectType(id);
          case 'Description': return p.getEntityDescription(id);
          case 'PredefinedType': return p.getEntityPredefinedType?.(id) ?? '';
          case 'GlobalId': return p.getEntityGlobalId(id);
        }
      },
      className: () => p.getEntityTypeName(id),
      typeName: () => p.getEntityDefiningTypeName?.(id) ?? '',
      propertySets: () => p.getPropertySets(id),
      quantitySets: () => p.getQuantitySets(id).map(withLengths),
      typePropertySets: () => p.getTypePropertySets?.(id) ?? [],
      typeQuantitySets: () => (p.getTypeQuantitySets?.(id) ?? []).map(withLengths),
      materials: () => p.getMaterialNames?.(id) ?? [],
      storey: () => p.getStoreyName?.(id) ?? '',
      lengthUnitScale: () => dataStore.lengthUnitScale ?? 1,
    };
  };
}

/** What the commands read from a view of `model`: its drawing's parts and elements, the plan's rooms, the labels of the elements. */
export function readersOf(model: AnnotateModel, set: Pick<DefaultSet, 'document' | 'levels'>, existing: readonly DraftEntity[], joinery: HeadlessAnnotateInput['joinery']): AnnotateReaders<HeadlessView, Drawing2D> {
  const book = styleBookOf(undefined, undefined);
  const current = { textStyle: DEFAULT_TEXT_STYLE.id, dimStyle: DEFAULT_DIM_STYLE.id };
  const ds = model.dataStore;
  const guidOf = (renderId: number) => ds?.entities.getGlobalId(renderId) || null;
  const byGuid = new Map<string, number>();
  // A door or window carries the mark the joinery schedule gives it (typed mark, its Tag, else its type's D1/W1), as the app's plan tag does.
  let marks: Map<string, string> | undefined;
  const markOf = (id: number, tag: string): string => {
    if (!ds) return elementMark({ tag, typeMark: '' });
    if (!marks) {
      const project = { joineryTypes: joinery?.joineryTypes ?? [], joineryMapping: joinery?.joineryMapping ?? DEFAULT_JOINERY_MAPPING };
      marks = markIndex(joineryScheduleData(scheduleModelsOf({ dataStore: ds, meshes: model.meshes }), project, 'all').entries, joinery?.joineryOverrides);
    }
    return marks.get(markKey('model', id)) ?? elementMark({ tag, typeMark: '' });
  };
  const read = ds ? elementReader(ds, (guid) => byGuid.get(guid), markOf) : () => null;
  // The frame a view is annotated in, as the app's `annotationFrameOf` says: a plan's drawing-y runs down the screen (up = -1), an elevation's and a section's up the screen (up = 1). One measure serves the label's anchor, its box and the boxes of what is placed.
  const measureOf = (view: HeadlessView): DimAllMeasure => (view.kind === 'plan' ? tableMeasure : { ...tableMeasure, frame: { ...tableMeasure.frame, up: 1 } });
  const rectsOfView = (view: HeadlessView) => annotationRects(measureOf(view));
  const plans = new Map(set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan').map((v) => [v.id, v]));
  const paperUnit = (c: ReadCall<HeadlessView, Drawing2D>) => paperUnitFor(c.view.id, set.document.sheets, [{ id: c.view.id, scale: c.view.scale }]);
  // Annotation sizes are paper sizes at the view's scale, as the open view reads them.
  const placement = (c: ReadCall<HeadlessView, Drawing2D>) => ({ viewId: c.view.id, layerId: DEFAULT_DRAFT_LAYER.id, textHeight: 0.25 * ((c.view.scale ?? 100) / 100), textStyle: current.textStyle, dimStyle: current.dimStyle, paperUnit: paperUnit(c) });
  // What the plan draws over its cut that a label keeps clear of: its door leaves and swings and window frames, as the app's `planSymbolObstacles` reads them (#707).
  const obstacleMemo = new Map<string, ObstacleBox[]>();
  const obstaclesOf = (c: ReadCall<HeadlessView, Drawing2D>): ObstacleBox[] => {
    const known = obstacleMemo.get(c.view.id);
    if (known) return known;
    const plan = plans.get(c.view.id);
    if (!plan || !ds) return [];
    const sources = { live: { dataStore: ds, view: null }, project: { joineryTypes: joinery?.joineryTypes ?? [], joineryMapping: joinery?.joineryMapping ?? DEFAULT_JOINERY_MAPPING } };
    const graphics = resolveViewGraphics(plan, set.document.viewTemplates);
    const boxes = openingObstacles(planOpeningSymbols(model.buildingMeshes, c.drawing.config.plane, sources, graphics, plan.level));
    // The grid, as the app's `gridOverlays` draws it: on unless the view hides it, its bubbles at the ends the view sets, at the view's scale.
    if (graphics?.grid?.visible ?? true) {
      const scale = plan.scale && plan.scale > 0 ? plan.scale : DEFAULT_VIEW_SCALE;
      const axes = gridAxesOfModel(ds, model.coordinateInfo, plan.level.storeyGlobalIds);
      boxes.push(...gridObstacles(gridShapesOf(axes, 'plan', c.drawing.config.plane, graphics?.grid?.ends ?? 'both', scale / 1000, c.drawing.bounds)));
    }
    obstacleMemo.set(c.view.id, boxes);
    return boxes;
  };
  const roomsOf = (c: ReadCall<HeadlessView, Drawing2D>) => {
    const plan = plans.get(c.view.id);
    return plan && ds ? roomsOfPlan(plan, set.levels, { meshes: model.meshes }, guidOf) : [];
  };
  return {
    draftsOf: (view) => existing.filter((d) => d.viewId === view.id),
    dimall: (c) => ({
      ...placement(c), placed: c.placed, parts: planParts(c.drawing, model.buildingMeshes), rooms: roomsOf(c), obstacles: obstaclesOf(c), newId: c.newId, book,
      firstMm: undefined, settings: { textHeight: placement(c).textHeight, textStyle: current.textStyle, dimStyle: current.dimStyle },
      reader: { sectionLink: () => null, measure: measureOf(c.view) }, rectsOf: rectsOfView(c.view),
    }),
    tagall: (c) => {
      const onPlan = c.view.kind === 'plan';
      const elements = onPlan ? viewElementsOf(c.drawing) : [];
      const targets = elements.flatMap((e) => {
        const guid = guidOf(e.renderId);
        if (!guid) return [];
        byGuid.set(guid, e.renderId);
        return [{ guid, className: ds?.entities.getTypeName(e.renderId) ?? '', anchor: e.anchor, renderId: e.renderId, ring: e.ring }];
      });
      const rooms = roomsOf(c);
      for (const r of rooms) byGuid.set(r.guid, r.renderId);
      const [mark, room] = TAGALL_TYPES;
      return {
        onPlan, elements, targets, rooms, existing: c.placed, obstacles: onPlan ? obstaclesOf(c) : [], placement: { ...placement(c), locale: c.locale }, types: { mark, room },
        env: { read, up: measureOf(c.view).frame.up, styled: (viewId, shape, cur) => styledParamsIn(book, paperUnit(c), shape, cur), newId: c.newId },
        reader: { sectionLink: () => null, measure: measureOf(c.view) }, rectsOf: rectsOfView(c.view),
      };
    },
    levelall: (c) => ({
      kind: c.view.kind, elements: viewElementsOf(c.drawing), levels: set.levels, existing: c.placed, rectsOf: rectsOfView(c.view), placement: placement(c),
      styled: (viewId, shape, cur) => styledParamsIn(book, paperUnit(c), shape, cur), newId: c.newId,
    }),
  };
}

/** The plans, elevations and sections of `document` that `choices` give a command, as the commands see a view. */
export function annotatableViews(document: ProjectDocument, only?: ReadonlySet<string>): { views: HeadlessView[]; all: AnnotatedView[] } {
  const all = document.views.filter((v): v is AnnotatedView => (v.kind === 'plan' || v.kind === 'elevation' || v.kind === 'section') && (!only || only.has(v.id)));
  return { all, views: all.map((v) => ({ id: v.id, name: v.name, kind: v.kind, scale: v.scale, ...(v.kind === 'plan' && v.detail ? { detail: v.detail } : {}) })) };
}

/** Annotate `set` of `model`: TAGALL and DIMALL on the plans, LEVELALL on the elevations and sections, as `choices` say. */
export async function annotateSetHeadless(input: HeadlessAnnotateInput): Promise<HeadlessAnnotateResult> {
  const { model, set, choices } = input;
  const existing = input.existing ?? [];
  const { all, views } = annotatableViews(set.document, input.viewIds);
  const drawings = model.extent && views.length > 0
    ? await generateViewDrawings(all, model.buildingMeshes, set.levels, model.extent, undefined, undefined, storeyFloorsOf(model.buildingMeshes, model.dataStore?.spatialHierarchy))
    : new Map<string, Drawing2D>();
  const result = await annotateViews<HeadlessView, Drawing2D>({
    views, choices, ...(input.tagParts ? { presets: { tagParts: input.tagParts } } : {}), readers: readersOf(model, set, existing, input.joinery),
    drawingOf: async (view) => {
      const drawing = drawings.get(view.id);
      return drawing ? { drawing } : { drawing: null, error: 'the view has nothing to draw' };
    },
    newId: input.newId ?? (() => freshProjectId('draft')), locale: input.locale ?? 'en',
  });
  const moved = [...result.drafts.values()].reduce((m, d) => new Map([...m, ...d.update]), new Map<string, DraftEntity['shape']>());
  const added = [...result.drafts.values()].flatMap((d) => d.add);
  return { ...result, all: [...existing.map((d) => { const shape = moved.get(d.id); return shape ? { ...d, shape } : d; }), ...added] };
}

/** `document` with `drafts` as the set's drafts (and layer "0" when it has no layers), where the sheets' drawing reads them (`readProjectSet`). */
export function withDrafts(document: ProjectDocument, drafts: readonly DraftEntity[]): ProjectDocument {
  const layers = (document as { draftLayers?: DraftLayer[] }).draftLayers;
  const next = { ...document, drafts: [...drafts], draftLayers: layers?.length ? layers : [DEFAULT_DRAFT_LAYER] };
  return next;
}

/** What the sheets print the drafts with, for a set that has no project's styles: the standard text and dimension styles and layer "0". */
export function annotationsOf(drafts: readonly DraftEntity[], locale: SheetLocale): SheetAnnotations {
  return { drafts, layers: [DEFAULT_DRAFT_LAYER], groups: [], book: styleBookOf(undefined, undefined), locale };
}
