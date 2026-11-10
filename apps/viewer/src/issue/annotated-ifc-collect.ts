/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the annotated copy of the IFC is made from (#82): the plan views of the project, each with the lines and texts of its drafts
 * as IFC world plan points (`drafting/ifc-shapes.ts`), and the marks of the element tags. Pure over the project's records, so a test
 * runs it on a project without the stores. The writing itself is the engine's (`@bimvoice/ifcsheet/annotated-ifc`).
 *
 * A draft on a hidden layer is not written, as the sheet does not draw it. Sections, elevations and the other views that carry
 * annotations are named, not written: their drawing is a vertical plane and each would need a 3D placement of its own.
 */

import type { AnnotatedSheet, AnnotatedView, DrawnCurve, DrawnText, ElementMark, LeftOutView } from '@bimvoice/ifcsheet/annotated-ifc';
import { drawingToWorld, viewNormal } from '@/drafting/frame';
import { ifcShapesOf } from '@/drafting/ifc-shapes';
import { lookOf, layerShows, type DimStyle, type LayerGroup, type TextStyle } from '@/drafting/styles';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { levelFloorY, resolvePlanLevel } from '@/project/view-defaults';
import type { AxisBounds } from '@/lib/section/section-distance';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { boundsCorners, viewCrop } from './annotated-ifc-crop';
import type { ProjectLevel, ProjectView } from '@/project/types';
import type { ProjectSheet } from '@/project/types';
import { tagOverrideOf } from '@/drafting/tag-override';
import { viewerToIfcAxes } from '@ifc-lite/geometry/world-frame';

export interface AnnotationSource {
  views: readonly ProjectView[];
  levels: readonly ProjectLevel[];
  drafts: readonly DraftEntity[];
  draftLayers: readonly DraftLayer[];
  layerGroups?: readonly LayerGroup[];
  textStyles?: readonly TextStyle[];
  dimStyles?: readonly DimStyle[];
  /** The sheets and the views on them, written as Bonsai sheets. */
  sheets?: readonly Pick<ProjectSheet, 'name' | 'viewports'>[];
  /** The loaded models' box in the render frame: the crop of a view that has none, and the depth of an elevation or section. */
  bounds?: AxisBounds | null;
}

export interface CollectedAnnotations {
  views: AnnotatedView[];
  marks: ElementMark[];
  leftOut: LeftOutView[];
  sheets: AnnotatedSheet[];
  /** Drafts that have no line to write (hatches). */
  hatches: number;
}

/**
 * `offset`: the render frame to IFC world translation, metres, Z up (`renderFrameWorldOffset`). `locale` words the dimension figures
 * and level marks as the sheet does.
 */
export function collectAnnotations(src: AnnotationSource, offset: { x: number; y: number }, locale: string): CollectedAnnotations {
  const layers = new Map(src.draftLayers.map((l) => [l.id, l]));
  const book = { textStyles: [...(src.textStyles ?? [])], dimStyles: [...(src.dimStyles ?? [])] };
  const out: CollectedAnnotations = { views: [], marks: [], leftOut: [], sheets: [], hatches: 0 };
  const marks = new Map<string, { mark: string; views: Set<string> }>();

  for (const view of src.views) {
    const mine = src.drafts.filter((d) => d.viewId === view.id && shows(d, layers, src.layerGroups ?? [], view));
    const vertical = view.kind === 'section' || view.kind === 'elevation';
    if (mine.length === 0 && view.kind !== 'plan' && !vertical) continue;
    if (view.kind !== 'plan') {
      // The annotations of a vertical view are named, not written; the view itself is a Bonsai drawing (its camera, no annotations).
      if (mine.length > 0) out.leftOut.push({ viewId: view.id, name: view.name, kind: vertical ? view.kind : 'other' });
      const drawing = vertical ? verticalDrawing(view, src, offset) : null;
      if (drawing) out.views.push(drawing);
      continue;
    }
    const level = resolvePlanLevel(view, src.levels) ?? view.level;
    const config = viewPlaneConfig(view, src.levels, null);
    if (!config) continue;
    const toWorld = (p: { x: number; y: number }) => {
      const ifc = viewerToIfcAxes(drawingToWorld(config, p));
      return { x: ifc.x + offset.x, y: ifc.y + offset.y };
    };
    const curves: DrawnCurve[] = [];
    const texts: DrawnText[] = [];
    for (const d of mine) {
      const shapes = ifcShapesOf(d.shape, { toWorld, locale, look: lookOf(book, d.params), paperUnit: (view.scale ?? 100) / 1000 });
      if (!shapes) { out.hatches += 1; continue; }
      curves.push(...shapes.curves);
      texts.push(...shapes.texts);
      // An element tag that shows the element's mark (not its name, class or a text written over it, which is not the element's): the mark the drawing has, with the views it is on.
      const guid = d.params.tagOf;
      if (typeof guid === 'string' && d.shape.type === 'leader' && (d.params.tagField === undefined || d.params.tagField === 'mark') && tagOverrideOf(d) === null && d.shape.text && d.shape.text !== '?') {
        const seen = marks.get(guid) ?? { mark: d.shape.text, views: new Set<string>() };
        seen.views.add(view.name);
        marks.set(guid, seen);
      }
    }
    // The camera covers the view's crop (viewport, detail or the model's box), as world plan metres.
    const crop = viewCrop(view, config, src.sheets ?? [], src.bounds ?? null);
    const corners = crop ? [crop.min, crop.max, { x: crop.min.x, y: crop.max.y }, { x: crop.max.x, y: crop.min.y }].map(toWorld) : [];
    const extent = corners.length > 0 ? { min: { x: Math.min(...corners.map((c) => c.x)), y: Math.min(...corners.map((c) => c.y)) }, max: { x: Math.max(...corners.map((c) => c.x)), y: Math.max(...corners.map((c) => c.y)) } } : undefined;
    out.views.push({ viewId: view.id, name: view.name, scale: view.scale ?? 100, storeyGlobalIds: level.storeyGlobalIds, cutHeight: view.cutHeight, viewDepth: view.viewDepth ?? undefined, extent, curves, texts });
  }
  out.sheets = (src.sheets ?? []).map((s) => ({ name: s.name, viewIds: [...new Set((s.viewports ?? []).map((vp) => vp.viewId))] }));
  out.marks = [...marks].map(([globalId, m]) => ({ globalId, mark: m.mark, views: [...m.views] }));
  return out;
}

function shows(d: DraftEntity, layers: ReadonlyMap<string, DraftLayer>, groups: readonly LayerGroup[], view: ProjectView): boolean {
  const layer = layers.get(d.layerId);
  return !layer || layerShows(layer, groups, { view: view.hiddenLayers });
}

/**
 * An elevation or section as a drawing without annotations: the camera looks along the view's normal (out of the drawing toward the
 * viewer, reversed), at the middle of its crop on the cut plane, as deep as the view sees (or the model's box behind the plane).
 * Z is measured from the floor of the lowest level, whose storey the camera is placed on. Null when the view cannot be placed.
 */
function verticalDrawing(view: ProjectView, src: AnnotationSource, offset: { x: number; y: number }): AnnotatedView | null {
  const base = [...src.levels].sort((a, b) => a.elevation - b.elevation)[0];
  const config: SectionPlaneConfig | null = base ? viewPlaneConfig(view, src.levels, src.bounds ?? null) : null;
  if (!base || !config) return null;
  const crop = viewCrop(view, config, src.sheets ?? [], src.bounds ?? null);
  if (!crop) return null;
  const n = viewNormal(config);
  const look = viewerToIfcAxes({ x: -n.x, y: -n.y, z: -n.z });
  const flat = Math.hypot(look.x, look.y);
  if (flat < 1e-6) return null;
  const middle = drawingToWorld(config, { x: (crop.min.x + crop.max.x) / 2, y: (crop.min.y + crop.max.y) / 2 });
  const centre = viewerToIfcAxes(middle);
  const dir = { x: look.x / flat || 0, y: look.y / flat || 0 }; // `|| 0`: no negative zero
  // The far side of the model along the look direction, from the plane (the view's own depth when it has one).
  const behind = Math.max(0, ...(src.bounds ? boundsCorners(src.bounds) : []).map((c) => {
    const p = viewerToIfcAxes(c);
    return (p.x - centre.x) * dir.x + (p.y - centre.y) * dir.y;
  }));
  return {
    viewId: view.id,
    name: view.name,
    scale: view.scale ?? 100,
    storeyGlobalIds: base.storeyGlobalIds,
    targetView: view.kind === 'elevation' ? 'ELEVATION_VIEW' : 'SECTION_VIEW',
    vertical: {
      look: dir,
      centre: { x: centre.x + offset.x, y: centre.y + offset.y, z: middle.y - levelFloorY(base) },
      width: crop.max.x - crop.min.x,
      height: crop.max.y - crop.min.y,
      depth: view.viewDepth ?? (behind > 0 ? behind : 10),
    },
    curves: [],
    texts: [],
  };
}
