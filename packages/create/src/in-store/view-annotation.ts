/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The annotations of one drawing view, written into an existing model as ONE `IfcAnnotation` (IfcSheet #82): the lines and
 * leaders as an `IfcGeometricCurveSet` of `IfcPolyline` / `IfcCircle` curves, the text as `IfcTextLiteralWithExtent`, both in one
 * `Annotation2D` representation of the model's `Annotation` / `Plan` subcontext, the annotation placed relative to its storey's
 * placement and contained in that storey (`IfcRelContainedInSpatialStructure`).
 *
 * Additive like every in-store builder: it only appends overlay entities and never reads, edits or renumbers an existing one.
 * Written for IFC2X3 and IFC4 alike: every entity used here has the same attributes in both, and `IfcOwnerHistory` is written
 * when the model has one (mandatory in IFC2X3, which `resolveSpatialAnchor` already insists on).
 *
 * Every coordinate is in the STOREY'S OWN frame, metres, as `addSpaceToStore` takes them; the caller turns a drawing's points
 * into that frame (`ifcsheet`'s `annotated-ifc.ts` does, with the storey's plan frame).
 */

import { generateIfcGuid } from '@ifc-lite/encoding';
import type { StoreEditor } from '@ifc-lite/mutations';
import type { MarkupAnchor, MarkupPoint2D } from './drawing-markup.js';
import { toNativeLength } from './anchor.js';
import { emitLocalPlacement, emitRelContainedInSpatialStructure, ownerHistoryRef } from './_emit-helpers.js';
import { emitMarkupPolyline } from './drawing-markup-geometry.js';
import { AnchorEntityReader } from './resolve-anchor.js';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { MutablePropertyView } from '@ifc-lite/mutations';

/** `IfcAnnotation.ObjectType` of a plan view's annotation: what a reader filters the set's annotations by. */
export const VIEW_ANNOTATION_OBJECTTYPE = 'IfcSheet:PlanAnnotations';

/** The property set both the annotation and a marked element carry. Not `Pset_`: that prefix belongs to buildingSMART. */
export const VIEW_ANNOTATION_PSET = 'IfcSheet_Annotation';

/** A curve of the annotation: a run of points (closed: the first is repeated at the end), or a circle. */
export type ViewAnnotationCurve =
  | { type: 'polyline'; points: readonly MarkupPoint2D[]; closed?: boolean }
  | { type: 'circle'; centre: MarkupPoint2D; radius: number };

/** A text of the annotation: its baseline starts at `position`, running along `direction` (a unit vector; absent is +X). */
export interface ViewAnnotationText {
  position: MarkupPoint2D;
  direction?: MarkupPoint2D;
  text: string;
  /** The box the text fills, metres (`IfcPlanarExtent`). */
  width: number;
  height: number;
}

export interface ViewAnnotationParams {
  /** `IfcAnnotation.Name`: the view's name. */
  name: string;
  curves: readonly ViewAnnotationCurve[];
  texts: readonly ViewAnnotationText[];
  /** Written as the `IfcSheet_Annotation` property set of the annotation (text properties). */
  properties?: readonly { name: string; value: string }[];
}

export interface ViewAnnotationAnchor extends MarkupAnchor {
  /** The storey the annotation is contained in. */
  storeyId: number;
}

export interface ViewAnnotationResult {
  annotationId: number;
  placementId: number;
  containmentId: number;
  curveSetId: number | null;
  textIds: number[];
}

const finite = (what: string, v: number): void => {
  if (!Number.isFinite(v)) throw new Error(`addViewAnnotationToStore: ${what} must be finite`);
};

/**
 * The model's plan annotation subcontext (`Annotation` / `Plan`, targeting a plan view) when it has one, else a new one under a
 * new `Plan` context that shares the model context's world coordinate system and true north. Reusing the existing one keeps a
 * file that already has annotations from growing a second, identical context.
 */
export function ensurePlanAnnotationContext(editor: StoreEditor, store: IfcDataStore, view: MutablePropertyView | null | undefined): number {
  const reader = new AnchorEntityReader(store, view);
  for (const id of reader.ids('IFCGEOMETRICREPRESENTATIONSUBCONTEXT')) {
    const attrs = reader.entity(id)?.attributes;
    if (!attrs) continue;
    const identifier = typeof attrs[0] === 'string' ? attrs[0].toLowerCase() : '';
    const target = typeof attrs[8] === 'string' ? attrs[8].replace(/\./g, '').toUpperCase() : '';
    if (identifier === 'annotation' && target === 'PLAN_VIEW') return id;
  }
  const rootId = reader.rootContextId();
  if (rootId === null) throw new Error('ensurePlanAnnotationContext: the model has no IfcGeometricRepresentationContext');
  const root = reader.entity(rootId)?.attributes ?? [];
  const ref = (v: unknown): string | null => (typeof v === 'number' && v > 0 ? `#${v}` : typeof v === 'string' && /^#\d+$/.test(v) ? v : null);
  const dim = typeof root[2] === 'number' ? root[2] : 3;
  const precision = typeof root[3] === 'number' ? root[3] : 1e-5;
  const plan = editor.addEntity('IfcGeometricRepresentationContext', [null, 'Plan', dim, precision, ref(root[4]), ref(root[5])]).expressId;
  // The derived attributes keep their slot as `*`, as the markup subcontext does; TargetScale is left open.
  return editor.addEntity('IfcGeometricRepresentationSubContext', ['Annotation', 'Plan', '*', '*', '*', '*', `#${plan}`, null, '.PLAN_VIEW.', null]).expressId;
}

/** Write one view's annotations (see the module comment). Throws on a non-finite coordinate rather than writing `NaN` into STEP. */
export function addViewAnnotationToStore(editor: StoreEditor, anchor: ViewAnnotationAnchor, contextId: number, params: ViewAnnotationParams): ViewAnnotationResult {
  const n = (metres: number) => toNativeLength(anchor, metres);
  for (const c of params.curves) {
    if (c.type === 'circle') { finite('circle', c.centre.x + c.centre.y + c.radius); continue; }
    if (c.points.length < 2) throw new Error('addViewAnnotationToStore: a polyline needs at least 2 points');
    for (const p of c.points) finite('polyline point', p.x + p.y);
  }
  for (const t of params.texts) finite('text', t.position.x + t.position.y + t.width + t.height);

  const placementId = emitLocalPlacement(editor, anchor.storeyPlacementId, [0, 0, 0]);
  const items: string[] = [];

  const curveIds: number[] = [];
  for (const c of params.curves) {
    if (c.type === 'polyline') {
      curveIds.push(emitMarkupPolyline(editor, c.points.map((p): [number, number] => [n(p.x), n(p.y)]), c.closed === true));
    } else {
      const centre = editor.addEntity('IfcCartesianPoint', [[n(c.centre.x), n(c.centre.y)]]).expressId;
      const position = editor.addEntity('IfcAxis2Placement2D', [`#${centre}`, null]).expressId;
      curveIds.push(editor.addEntity('IfcCircle', [`#${position}`, n(Math.abs(c.radius))]).expressId);
    }
  }
  const curveSetId = curveIds.length > 0 ? editor.addEntity('IfcGeometricCurveSet', [curveIds.map((id) => `#${id}`)]).expressId : null;
  if (curveSetId !== null) items.push(`#${curveSetId}`);

  const textIds: number[] = [];
  for (const t of params.texts) {
    const origin = editor.addEntity('IfcCartesianPoint', [[n(t.position.x), n(t.position.y)]]).expressId;
    const d = t.direction;
    const refDirection = d && (Math.abs(d.x - 1) > 1e-9 || Math.abs(d.y) > 1e-9)
      ? `#${editor.addEntity('IfcDirection', [[d.x, d.y]]).expressId}`
      : null;
    const placement = editor.addEntity('IfcAxis2Placement2D', [`#${origin}`, refDirection]).expressId;
    const extent = editor.addEntity('IfcPlanarExtent', [n(Math.abs(t.width)), n(Math.abs(t.height))]).expressId;
    textIds.push(editor.addEntity('IfcTextLiteralWithExtent', [t.text, `#${placement}`, '.RIGHT.', `#${extent}`, 'bottom-left']).expressId);
  }
  items.push(...textIds.map((id) => `#${id}`));
  if (items.length === 0) throw new Error('addViewAnnotationToStore: nothing to write');

  const shapeRepId = editor.addEntity('IfcShapeRepresentation', [`#${contextId}`, 'Annotation', 'Annotation2D', items]).expressId;
  const productShapeId = editor.addEntity('IfcProductDefinitionShape', [null, null, [`#${shapeRepId}`]]).expressId;
  const annotationId = editor.addEntity('IfcAnnotation', [
    generateIfcGuid(anchor.guidRandom),
    ownerHistoryRef(anchor.ownerHistoryId),
    params.name,
    null,
    VIEW_ANNOTATION_OBJECTTYPE,
    `#${placementId}`,
    `#${productShapeId}`,
  ]).expressId;
  const containmentId = emitRelContainedInSpatialStructure(editor, anchor.ownerHistoryId, annotationId, anchor.storeyId, anchor.guidRandom);
  if (params.properties && params.properties.length > 0) {
    editor.addPropertySet(annotationId, VIEW_ANNOTATION_PSET, params.properties.map((p) => ({ name: p.name, value: p.value, type: 'LABEL' as const })));
  }
  return { annotationId, placementId, containmentId, curveSetId, textIds };
}
