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

import type { AnnotatedView, DrawnCurve, DrawnText, ElementMark, LeftOutView } from '@bimvoice/ifcsheet/annotated-ifc';
import { drawingToWorld } from '@/drafting/frame';
import { ifcShapesOf } from '@/drafting/ifc-shapes';
import { lookOf, layerShows, type DimStyle, type LayerGroup, type TextStyle } from '@/drafting/styles';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { resolvePlanLevel } from '@/project/view-defaults';
import type { ProjectLevel, ProjectView } from '@/project/types';
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
}

export interface CollectedAnnotations {
  views: AnnotatedView[];
  marks: ElementMark[];
  leftOut: LeftOutView[];
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
  const out: CollectedAnnotations = { views: [], marks: [], leftOut: [], hatches: 0 };
  const marks = new Map<string, { mark: string; views: Set<string> }>();

  for (const view of src.views) {
    const mine = src.drafts.filter((d) => d.viewId === view.id && shows(d, layers, src.layerGroups ?? [], view));
    if (mine.length === 0) continue;
    if (view.kind !== 'plan') {
      out.leftOut.push({ viewId: view.id, name: view.name, kind: view.kind === 'section' || view.kind === 'elevation' ? view.kind : 'other' });
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
    if (curves.length > 0 || texts.length > 0) {
      out.views.push({ viewId: view.id, name: view.name, scale: view.scale ?? 100, storeyGlobalIds: level.storeyGlobalIds, curves, texts });
    }
  }
  out.marks = [...marks].map(([globalId, m]) => ({ globalId, mark: m.mark, views: [...m.views] }));
  return out;
}

function shows(d: DraftEntity, layers: ReadonlyMap<string, DraftLayer>, groups: readonly LayerGroup[], view: ProjectView): boolean {
  const layer = layers.get(d.layerId);
  return !layer || layerShows(layer, groups, { view: view.hiddenLayers });
}
