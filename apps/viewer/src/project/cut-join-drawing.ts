/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drawing with its cut faces joined where like meets like (`cut-join.ts`):
 * walls with walls, slabs with slabs, each material band with the same
 * material's. Both ways a drawing draws its cut are brought in line: the
 * faces (the drafting view strokes their rings) and the cut lines (sheets
 * and exports stroke those). Picking reads the drawing before this, so a
 * click still finds the one wall under it.
 */

import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { strictlyInside, unionFaces, type Face, type Pt2 } from './cut-join';

/** The categories whose cut faces join with their own kind. */
const JOINED = new Set(['walls', 'slabs', 'roofs', 'columns', 'beams', 'stairs', 'railings', 'other']);

/** What a face is made of, for joining: a material name (`cutMaterialKey`), or by default its band id and colour. */
export type MaterialKeyOf = (p: DrawingPolygon) => string;
const bandKey: MaterialKeyOf = (p) => `${p.materialId ?? ''}/${p.color?.join(',') ?? ''}`;

/** Like with like: the same category and the same material; never across models. */
function joinKey(p: DrawingPolygon, categoryOf: (ifcType: string) => string | null, materialOf: MaterialKeyOf): string | null {
  const category = categoryOf(p.ifcType ?? '');
  if (!category || !JOINED.has(category)) return null;
  return `${category}|${materialOf(p)}|${p.modelIndex}`;
}

const TOL = 5e-5;

const ringArea = (ring: readonly Pt2[]): number => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);

/**
 * The parts of `line` that run along `boundary`: a cut line of a joined
 * element keeps only what is still outline. Trimming the element's own lines
 * (rather than drawing the joined outline anew) keeps what earlier steps
 * decided about them, such as a foil drawn as a membrane instead.
 */
function trimToBoundary(line: DrawingLine, boundary: readonly { a: Pt2; b: Pt2 }[]): DrawingLine[] {
  const { start: a, end: b } = line.line;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < TOL * TOL) return [];
  const len = Math.sqrt(len2);
  const off = (p: Pt2) => Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
  const along = (p: Pt2) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const spans: [number, number][] = [];
  for (const s of boundary) {
    if (off(s.a) > TOL * 10 || off(s.b) > TOL * 10) continue;
    const t0 = Math.max(0, Math.min(along(s.a), along(s.b)));
    const t1 = Math.min(1, Math.max(along(s.a), along(s.b)));
    if (t1 - t0 > 1e-9) spans.push([t0, t1]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  const merged: [number, number][] = [];
  for (const sp of spans) {
    const last = merged.at(-1);
    if (last && sp[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], sp[1]);
    else merged.push([...sp]);
  }
  if (merged.length === 1 && merged[0][0] <= 1e-9 && merged[0][1] >= 1 - 1e-9) return [line];
  const at = (t: number): Pt2 => ({ x: a.x + dx * t, y: a.y + dy * t });
  return merged.map(([t0, t1]) => ({ ...line, line: { start: at(t0), end: at(t1) } }));
}

/** `categoryOf`: an IFC class's view category (`view-graphics.ts`); `materialOf`: what a face is made of. */
export function joinCuts<T extends Drawing2D>(drawing: T, categoryOf: (ifcType: string) => string | null, materialOf: MaterialKeyOf = bandKey): T {
  const groups = new Map<string, DrawingPolygon[]>();
  const rest: DrawingPolygon[] = [];
  for (const p of drawing.cutPolygons) {
    const k = joinKey(p, categoryOf, materialOf);
    if (k === null) rest.push(p);
    else groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const polygons: DrawingPolygon[] = [...rest];
  /** Entities whose cut lines are trimmed to the joined outlines, and those outlines. */
  const trimmed = new Set<number>();
  const boundary: { a: Pt2; b: Pt2 }[] = [];
  /** The joined faces: what lies inside one is under a cut, out of sight. */
  const joinedFaces: Face[] = [];
  let changed = false;
  for (const members of groups.values()) {
    const joined = members.length > 1 ? unionFaces(members.map((m) => m.polygon)) : null;
    if (!joined || joined.length === members.length) {
      polygons.push(...members);
      for (const m of members) for (const ring of [m.polygon.outer, ...m.polygon.holes]) ring.forEach((p, i) => boundary.push({ a: p, b: ring[(i + 1) % ring.length] }));
      continue;
    }
    changed = true;
    for (const m of members) trimmed.add(m.entityId);
    // A joined face speaks for its largest member (its colour, its class).
    for (const face of joined) {
      const owner = members.filter((m) => m.polygon.outer.some((q) => face.outer.some((r) => Math.hypot(r.x - q.x, r.y - q.y) < 1e-3)))
        .sort((p, q) => ringArea(q.polygon.outer) - ringArea(p.polygon.outer))[0] ?? members[0];
      polygons.push({ ...owner, polygon: { outer: face.outer, holes: face.holes } });
      joinedFaces.push(face);
      for (const ring of [face.outer, ...face.holes]) ring.forEach((p, i) => boundary.push({ a: p, b: ring[(i + 1) % ring.length] }));
    }
  }
  if (!changed) return drawing;
  const underCut = (l: DrawingLine): boolean => {
    const m = { x: (l.line.start.x + l.line.end.x) / 2, y: (l.line.start.y + l.line.end.y) / 2 };
    return joinedFaces.some((f) => strictlyInside(m, f));
  };
  const lines = drawing.lines.flatMap((l) => {
    if (!trimmed.has(l.entityId)) return [l];
    if (l.category === 'cut') return trimToBoundary(l, boundary);
    // A joined element's own projected edges that fall inside the joined face (a joint seen from above) are hidden by the cut.
    return underCut(l) ? [] : [l];
  });
  return { ...drawing, cutPolygons: polygons, lines };
}
