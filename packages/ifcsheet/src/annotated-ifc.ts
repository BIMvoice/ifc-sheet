/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `@bimvoice/ifcsheet/annotated-ifc` (#82): a COPY of the IFC with the drawing set's annotations written into it, so the model
 * can carry them to another viewer. One `IfcAnnotation` per plan view, contained in the view's storey, its curves and texts in
 * the model's `Annotation` / `Plan` subcontext (`addViewAnnotationToStore` in `@ifc-lite/create`); an element's mark as the
 * `IfcSheet_Annotation` property set, only where the file's own Tag does not already say it.
 *
 * The source is read and never written: the copy is the source's own STEP lines followed by the new entities, numbered after the
 * file's highest id, in the source's schema (IFC2X3 or IFC4). Nothing existing is renumbered, so every GlobalId and reference of the
 * source reads the same in the copy.
 *
 * Takes the annotations as shapes in the IFC's WORLD plan coordinates, metres, Z up (the frame of the file before any storey's
 * placement): the caller owns the step from a view's drawing to there (the app lifts a drawing point onto the view's plane and
 * adds the render-frame offset, `drafting/frame.ts` and `renderFrameWorldOffset`), so the engine assumes nothing about how a
 * drawing was cut. Sections and elevations are not written: their drawing is a vertical plane, not a storey's plan, and each would need a 3D
 * placement of its own; they are reported as left out, not dropped quietly. Needs the parser, so it is a subpath of its own.
 */

import { StepExporter } from '@ifc-lite/export';
import {
  MutablePropertyView,
  StoreEditor,
} from '@ifc-lite/mutations';
import { IfcParser, extractEntityAttributesOnDemand, extractPropertiesOnDemand, type IfcDataStore } from '@ifc-lite/parser';
import {
  VIEW_ANNOTATION_PSET,
  addViewAnnotationToStore,
  ensurePlanAnnotationContext,
  resolveSpatialAnchor,
  storeyPlanFrame,
  toStoreyLocal,
  type ViewAnnotationCurve,
  type ViewAnnotationText,
} from '@ifc-lite/create';

export { VIEW_ANNOTATION_OBJECTTYPE, VIEW_ANNOTATION_PSET } from '@ifc-lite/create';

export interface Pt2 { x: number; y: number }

/** A curve in world metres. */
export type DrawnCurve =
  | { type: 'polyline'; points: readonly Pt2[]; closed?: boolean }
  | { type: 'circle'; centre: Pt2; radius: number };

/** A text in world metres: its box's bottom-left corner is `position`, its baseline runs along `direction` (unit; absent +x), and `width` x `height` is the box it fills. */
export interface DrawnText {
  position: Pt2;
  direction?: Pt2;
  text: string;
  width: number;
  height: number;
}

/** One plan view's annotations. */
export interface AnnotatedView {
  viewId: string;
  name: string;
  /** The drawing scale denominator (100 for 1:100); written as the annotation's `Scale`. */
  scale?: number;
  /** The GlobalIds of the storeys of the view's level, one per model that has it; the one this file holds is used. */
  storeyGlobalIds: readonly string[];
  curves: readonly DrawnCurve[];
  texts: readonly DrawnText[];
}

/** An element's mark as the drawings show it. */
export interface ElementMark {
  globalId: string;
  mark: string;
  /** The names of the views it is tagged on. */
  views: readonly string[];
}

/** A view kind this export does not write (see the module comment). */
export interface LeftOutView { viewId: string; name: string; kind: 'section' | 'elevation' | 'other' }

export interface AnnotatedIfcInput {
  /** The IFC as loaded. Never modified; the copy is a new buffer. */
  source: Uint8Array;
  views: readonly AnnotatedView[];
  marks?: readonly ElementMark[];
  /** Views the caller could not give as plan annotations, to be named in the notes. */
  leftOut?: readonly LeftOutView[];
  /** The name the copy is written under (the header's `FILE_NAME`); absent is `export.ifc`. */
  fileName?: string;
}

export type AnnotatedIfcNoteKey =
  | 'viewLeftOut'
  | 'noStorey'
  | 'storeyFrame'
  | 'viewEmpty'
  | 'markNoElement'
  | 'markInTag';

export interface AnnotatedIfcNote { key: AnnotatedIfcNoteKey; params: Record<string, string | number> }

export interface WrittenAnnotation {
  viewId: string;
  name: string;
  /** The new IfcAnnotation's express id in the copy, and the storey it is contained in. */
  expressId: number;
  storeyExpressId: number;
  storeyGlobalId: string;
  curves: number;
  texts: number;
}

export interface AnnotatedIfcResult {
  bytes: Uint8Array;
  schema: string;
  annotations: WrittenAnnotation[];
  /** Elements that got the `IfcSheet_Annotation` property set. */
  marked: { globalId: string; expressId: number; mark: string }[];
  /** What became of each mark given: written, already the file's own Tag (or Name), or the element is not in this file. */
  marks: { globalId: string; mark: string; state: 'written' | 'inTag' | 'noElement' }[];
  notes: AnnotatedIfcNote[];
  /** What the STEP writer said about the copy (an empty list is the usual answer). */
  warnings: string[];
}

/** Express ids of the storeys by GlobalId. */
function storeysByGuid(ds: IfcDataStore): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of ds.spatialHierarchy?.byStorey.keys() ?? []) {
    const guid = ds.entities.getGlobalId(id);
    if (guid) out.set(guid, id);
  }
  return out;
}

/** Express id of the entity with this GlobalId, or undefined. */
function indexByGuid(ds: IfcDataStore, wanted: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>();
  if (wanted.size === 0) return out;
  // @raw-entity-enumeration-ok one pass over the source index to resolve a handful of GlobalIds
  for (const id of ds.entityIndex.byId.keys()) {
    const guid = ds.entities.getGlobalId(id);
    if (guid && wanted.has(guid)) {
      out.set(guid, id);
      if (out.size === wanted.size) break;
    }
  }
  return out;
}

/** World plan points and directions as the storey's local ones. */
function localizer(frame: ReturnType<typeof storeyPlanFrame> & object) {
  const [c, s] = frame.axisX;
  return {
    point: (p: Pt2): Pt2 => {
      const [x, y] = toStoreyLocal(frame, [p.x, p.y]);
      return { x, y };
    },
    // A direction turns with the storey but is not moved by its origin.
    direction: (d: Pt2): Pt2 => ({ x: c * d.x + s * d.y, y: -s * d.x + c * d.y }),
  };
}

export async function buildAnnotatedIfc(input: AnnotatedIfcInput): Promise<AnnotatedIfcResult> {
  // Parse a COPY of the bytes: the parser keeps the buffer it is given as its source, and the source must stay the caller's.
  const buffer = input.source.slice().buffer as ArrayBuffer;
  const store = await new IfcParser().parseColumnar(buffer, { disableWorkerScan: true });
  const schema = store.schemaVersion ?? 'IFC4';
  if (schema !== 'IFC2X3' && schema !== 'IFC4' && schema !== 'IFC4X3') throw new Error(`annotated IFC: ${schema} is not written (IFC2X3, IFC4 and IFC4X3 are)`);

  const view = new MutablePropertyView(null, 'annotated-ifc');
  view.setOnDemandExtractor((entityId: number) => extractPropertiesOnDemand(store, entityId));
  const editor = new StoreEditor(store, view);
  const storeys = storeysByGuid(store);
  const notes: AnnotatedIfcNote[] = [];
  for (const l of input.leftOut ?? []) notes.push({ key: 'viewLeftOut', params: { view: l.name, kind: l.kind } });

  const annotations: WrittenAnnotation[] = [];
  let contextId: number | null = null;
  for (const v of input.views) {
    if (v.curves.length === 0 && v.texts.length === 0) { notes.push({ key: 'viewEmpty', params: { view: v.name } }); continue; }
    const storeyGlobalId = v.storeyGlobalIds.find((g) => storeys.has(g));
    if (!storeyGlobalId) { notes.push({ key: 'noStorey', params: { view: v.name } }); continue; }
    const storeyId = storeys.get(storeyGlobalId) as number;
    const frame = storeyPlanFrame(store, storeyId);
    if (!frame) { notes.push({ key: 'storeyFrame', params: { view: v.name } }); continue; }
    const to = localizer(frame);
    contextId ??= ensurePlanAnnotationContext(editor, store, view);
    const anchor = { ...resolveSpatialAnchor(store, storeyId, view), storeyId };
    const curves: ViewAnnotationCurve[] = v.curves.map((c) => (c.type === 'circle'
      ? { type: 'circle', centre: to.point(c.centre), radius: c.radius }
      : { type: 'polyline', points: c.points.map(to.point), closed: c.closed }));
    const texts: ViewAnnotationText[] = v.texts.map((t) => ({ position: to.point(t.position), direction: t.direction ? to.direction(t.direction) : undefined, text: t.text, width: t.width, height: t.height }));
    const written = addViewAnnotationToStore(editor, anchor, contextId, {
      name: v.name,
      curves,
      texts,
      properties: [{ name: 'View', value: v.name }, ...(v.scale ? [{ name: 'Scale', value: `1:${v.scale}` }] : [])],
    });
    annotations.push({ viewId: v.viewId, name: v.name, expressId: written.annotationId, storeyExpressId: storeyId, storeyGlobalId, curves: curves.length, texts: texts.length });
  }

  const marked: AnnotatedIfcResult['marked'] = [];
  const markStates: AnnotatedIfcResult['marks'] = [];
  const wanted = new Set((input.marks ?? []).map((m) => m.globalId));
  const elements = indexByGuid(store, wanted);
  for (const m of input.marks ?? []) {
    const id = elements.get(m.globalId);
    if (id === undefined) { notes.push({ key: 'markNoElement', params: { mark: m.mark } }); markStates.push({ globalId: m.globalId, mark: m.mark, state: 'noElement' }); continue; }
    // The file's own Tag (or, for an element with none, its Name) already says it: nothing to add.
    const root = extractEntityAttributesOnDemand(store, id);
    if (m.mark === root.tag || m.mark === root.name) { notes.push({ key: 'markInTag', params: { mark: m.mark } }); markStates.push({ globalId: m.globalId, mark: m.mark, state: 'inTag' }); continue; }
    editor.addPropertySet(id, VIEW_ANNOTATION_PSET, [
      { name: 'Mark', value: m.mark, type: 'LABEL' },
      ...(m.views.length > 0 ? [{ name: 'TaggedOn', value: m.views.join(', '), type: 'TEXT' as const }] : []),
    ]);
    marked.push({ globalId: m.globalId, expressId: id, mark: m.mark });
    markStates.push({ globalId: m.globalId, mark: m.mark, state: 'written' });
  }

  const result = new StepExporter(store, view).export({ schema, applyMutations: true, ...(input.fileName ? { filename: input.fileName } : {}) });
  return { bytes: result.content, schema, annotations, marked, marks: markStates, notes, warnings: result.stats.warnings.map(String) };
}
