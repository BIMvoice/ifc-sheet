/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a view leaves out because it hides single elements or single lines (#33), applied to the drawing the generator made BEFORE
 * anything is derived from it: the building materials' hatches and membrane lines (`material-drawing.ts`), the pick and snap
 * references, the styled drawing. A hidden element so has no face, no line, no material hatch, no membrane and nothing to click.
 * The same object comes back when the view hides nothing (the common case costs nothing).
 *
 * The drawing carries renderer ids; a view names elements by GlobalId, so every function takes the lookup (`renderIdGlobalId`).
 */

import { hasElementGraphics, hiddenLineEntry, lineHidden, resolveElementGraphics } from '@bimvoice/ifcsheet';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { ViewGraphics } from './types';

type GlobalIdOf = (entityId: number) => string | null | undefined;

/** The drawing without the faces and lines of the elements the view hides, and the single lines it hides. */
export function withoutHiddenElements<D extends Drawing2D>(drawing: D, graphics: ViewGraphics | undefined, globalIdOf: GlobalIdOf): D {
  if (!hasElementGraphics(graphics)) return drawing;
  const known = new Map<number, string | null | undefined>();
  const gid = (id: number) => (known.has(id) ? known.get(id) : (known.set(id, globalIdOf(id)), known.get(id)));
  const hides = (item: { entityId: number; ifcType?: string }) => resolveElementGraphics(graphics, gid(item.entityId), item.ifcType)?.visible === false;
  const lines = drawing.lines.filter((l) => !hides(l) && !lineHidden(graphics, gid(l.entityId), l.line));
  const cutPolygons = drawing.cutPolygons.filter((p) => !hides(p));
  return lines.length === drawing.lines.length && cutPolygons.length === drawing.cutPolygons.length ? drawing : { ...drawing, lines, cutPolygons };
}

/** The meshes of the elements the view shows: door and window symbols are drawn from these (a hidden door has no swing). */
export function withoutHiddenElementMeshes<T extends { expressId: number; ifcType?: string }>(meshes: readonly T[] | undefined, graphics: ViewGraphics | undefined, globalIdOf: GlobalIdOf): readonly T[] | undefined {
  if (!meshes || !hasElementGraphics(graphics)) return meshes;
  const shown = meshes.filter((m) => resolveElementGraphics(graphics, globalIdOf(m.expressId), m.ifcType)?.visible !== false);
  return shown.length === meshes.length ? meshes : shown;
}

interface P2 { x: number; y: number }
/** What a view hides, as the drawing would have it (the "show hidden" ghost, #33). */
export interface HiddenGhosts {
  /** By GlobalId: the rings of the cut faces and the segments of the lines of each element the view hides. */
  elements: Map<string, { rings: P2[][]; segments: { a: P2; b: P2 }[] }>;
  /** The single lines hidden, each with its `hiddenLines` entry. */
  lines: { entry: string; a: P2; b: P2 }[];
}

/** The elements and lines of `drawing` (the generator's, whole) that the view hides. */
export function hiddenGhosts(drawing: Drawing2D, graphics: ViewGraphics | undefined, globalIdOf: GlobalIdOf): HiddenGhosts {
  const out: HiddenGhosts = { elements: new Map(), lines: [] };
  if (!hasElementGraphics(graphics)) return out;
  const entry = (gid: string) => {
    let e = out.elements.get(gid);
    if (!e) out.elements.set(gid, (e = { rings: [], segments: [] }));
    return e;
  };
  for (const p of drawing.cutPolygons) {
    const gid = globalIdOf(p.entityId);
    if (gid && resolveElementGraphics(graphics, gid, p.ifcType)?.visible === false) entry(gid).rings.push(p.polygon.outer, ...p.polygon.holes);
  }
  for (const l of drawing.lines) {
    const gid = globalIdOf(l.entityId);
    if (!gid) continue;
    if (resolveElementGraphics(graphics, gid, l.ifcType)?.visible === false) entry(gid).segments.push({ a: l.line.start, b: l.line.end });
    else if (lineHidden(graphics, gid, l.line)) out.lines.push({ entry: hiddenLineEntry(gid, l.line), a: l.line.start, b: l.line.end });
  }
  return out;
}
