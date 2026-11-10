/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drawing with its like cut faces joined where they meet (#349): walls with walls, slabs with slabs, roofs, columns, each
 * of one material (a layered wall's brick band with the next wall's brick band). A plan then shows no mitre diagonal at a
 * corner and no line across a T where two walls of one material meet. Both ways a drawing draws its cut are brought in line:
 * the faces (the app's drafting view strokes their rings, the headless sheets too) and the cut lines (the sheets and the
 * exports stroke those). The app's drafting view and sheets (`styledDrawing`) and the headless sheets (`sheet-graphic.ts`)
 * call this one function. Picking and the annotation tools read the drawing before it, so a click still finds the one wall.
 */

import type { DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { JOIN_TOL, ringArea, segmentGrid, splits, strictlyInside, unionFaces, type Face, type Pt2, type Seg } from './cut-join.js';
import { VIEW_CATEGORY_CLASSES } from './view-templates.js';

/** The categories whose cut faces join with their own kind. Beams and members (a rafter, a purlin) stay drawn one by one. */
const JOINED = new Set<string>(['walls', 'slabs', 'roofs', 'columns']);
const CATEGORY_OF = new Map<string, string>(VIEW_CATEGORY_CLASSES.flatMap((c) => c.classes.map((k) => [k.toUpperCase(), c.id] as const)));

/** A cut face as the styling steps leave it: the marks that decide how it draws are part of what makes two faces alike. */
type MarkedPolygon = DrawingPolygon & { materialFill?: string | null; elementStyle?: unknown; phase?: string; schemeColour?: string };

/**
 * What decides that two cut faces are alike, or null when the face never joins: its category (walls, slabs, roofs, columns),
 * its model, its material (`material`: a name, else the band's IfcMaterial), and every mark the styling gave it (its band
 * colour, its material's fill, its own graphics, its phase, its colour scheme's fill).
 */
export function likeCutKey(p: MarkedPolygon, material?: string | null): string | null {
  const category = CATEGORY_OF.get((p.ifcType ?? '').toUpperCase());
  if (!category || !JOINED.has(category)) return null;
  const made = material ? `n:${material.trim().toLowerCase()}` : p.materialId !== undefined ? `m:${p.materialId}` : '';
  const style = p.elementStyle === undefined ? '' : JSON.stringify(p.elementStyle);
  return [category, p.modelIndex, made, p.color?.join(',') ?? '', p.materialFill === undefined ? '' : String(p.materialFill), style, p.phase ?? '', p.schemeColour ?? ''].join('|');
}

/** The face's box, grown by `pad`. */
const boxOf = (ring: readonly Pt2[], pad: number) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ring) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
};
type Box = ReturnType<typeof boxOf>;
const overlap = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** The members in clusters whose boxes touch (a sweep along x): only faces that may meet are unioned together. */
function clusters<T>(members: readonly T[], box: (m: T) => Box): T[][] {
  const boxes = members.map(box);
  const parent = members.map((_, i) => i);
  const root = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].x0 - boxes[b].x0);
  const open: number[] = [];
  for (const i of order) {
    for (let k = open.length - 1; k >= 0; k--) {
      const j = open[k];
      if (boxes[j].x1 < boxes[i].x0) open.splice(k, 1);
      else if (overlap(boxes[i], boxes[j])) parent[root(i)] = root(j);
    }
    open.push(i);
  }
  const out = new Map<number, T[]>();
  members.forEach((m, i) => { const r = root(i); const l = out.get(r); if (l) l.push(m); else out.set(r, [m]); });
  return [...out.values()];
}

const ringSegs = (ring: readonly Pt2[]): Seg[] => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length] }));

/**
 * The parts of `line` that run along `near` boundary segments: a cut line of a joined element keeps only what is still outline.
 * Trimming the element's own lines (rather than drawing the joined outline anew) keeps what earlier steps decided about them,
 * such as a foil drawn as a membrane instead.
 */
function trimToBoundary(line: DrawingLine, near: (q: Seg) => Seg[]): DrawingLine[] {
  const { start: a, end: b } = line.line;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < JOIN_TOL * JOIN_TOL) return [];
  const len = Math.sqrt(len2);
  const off = (p: Pt2) => Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
  const along = (p: Pt2) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const spans: [number, number][] = [];
  for (const s of near({ a, b })) {
    if (off(s.a) > JOIN_TOL * 10 || off(s.b) > JOIN_TOL * 10) continue;
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

/**
 * `drawing` with its like cut faces joined (`keyOf`: what makes two faces alike, `likeCutKey` by default; null: never joined).
 * A joined face speaks for its largest member (its element, its class, its colour). The joined elements' cut lines are trimmed
 * to the joined outlines, and every other line keeps only its parts outside the joined faces (a joint seen from above goes). The same
 * object when nothing joins.
 */
export function joinLikeCuts<P extends DrawingPolygon, L extends DrawingLine, D extends { cutPolygons: P[]; lines: L[] }>(
  drawing: D, keyOf: (p: P) => string | null = likeCutKey,
): D {
  const order = new Map<P, number>(drawing.cutPolygons.map((p, i) => [p, i]));
  const groups = new Map<string, P[]>();
  /** Each face drawn, with the place of its first member in the drawing: a joined face paints where its members did. */
  const polygons: { p: P; at: number }[] = [];
  for (const p of drawing.cutPolygons) {
    const k = keyOf(p);
    const g = k === null ? undefined : groups.get(k);
    if (k === null) polygons.push({ p, at: order.get(p) ?? 0 });
    else if (g) g.push(p);
    else groups.set(k, [p]);
  }
  /** Entities whose cut lines are trimmed to the joined outlines, and those outlines. */
  const trimmed = new Set<number>();
  const boundary: Seg[] = [];
  /** The joined faces: what lies inside one is under a cut, out of sight. */
  const joinedFaces: { face: Face; box: Box }[] = [];
  const keep = (m: P) => {
    polygons.push({ p: m, at: order.get(m) ?? 0 });
    for (const ring of [m.polygon.outer, ...m.polygon.holes]) boundary.push(...ringSegs(ring));
  };
  for (const members of groups.values()) {
    for (const cluster of members.length > 1 ? clusters(members, (m) => boxOf(m.polygon.outer, JOIN_TOL * 10)) : [members]) {
      const joined = cluster.length > 1 ? unionFaces(cluster.map((m) => m.polygon)) : null;
      if (!joined || joined.length >= cluster.length) {
        cluster.forEach(keep);
        continue;
      }
      for (const m of cluster) trimmed.add(m.entityId);
      const at = Math.min(...cluster.map((m) => order.get(m) ?? 0));
      const bySize = [...cluster].sort((p, q) => ringArea(q.polygon.outer) - ringArea(p.polygon.outer));
      for (const face of joined) {
        const box = boxOf(face.outer, JOIN_TOL * 10);
        const inFace = (m: P) => { const b = boxOf(m.polygon.outer, 0); return b.x0 >= box.x0 && b.x1 <= box.x1 && b.y0 >= box.y0 && b.y1 <= box.y1; };
        const owner = joined.length === 1 ? bySize[0] : bySize.find(inFace) ?? bySize[0];
        polygons.push({ p: { ...owner, polygon: { outer: face.outer, holes: face.holes } }, at });
        joinedFaces.push({ face, box });
        for (const ring of [face.outer, ...face.holes]) boundary.push(...ringSegs(ring));
      }
    }
  }
  if (trimmed.size === 0) return drawing;
  const near = segmentGrid(boundary);
  const faceEdges = segmentGrid(joinedFaces.flatMap((f) => [f.face.outer, ...f.face.holes].flatMap(ringSegs)));
  const inJoined = (m: Pt2) => joinedFaces.some((f) => m.x >= f.box.x0 && m.x <= f.box.x1 && m.y >= f.box.y0 && m.y <= f.box.y1 && strictlyInside(m, f.face));
  /** The parts of a line outside every joined face: a line inside a cut face is left out in every view (#751). */
  const outside = (l: L): L[] => {
    const { start: a, end: b } = l.line;
    const edges = faceEdges({ a, b });
    if (edges.length === 0 && !inJoined({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) return [l];
    const ts = [...new Set([0, 1, ...edges.flatMap((e) => splits(a, b, e.a, e.b)).map((t) => Math.min(1, Math.max(0, t)))])].sort((p, q) => p - q);
    const at = (t: number): Pt2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const kept: [number, number][] = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < 1e-9 || inJoined(at((ts[i] + ts[i + 1]) / 2))) continue;
      const last = kept.at(-1);
      if (last && Math.abs(last[1] - ts[i]) < 1e-9) last[1] = ts[i + 1];
      else kept.push([ts[i], ts[i + 1]]);
    }
    if (kept.length === 1 && kept[0][0] === 0 && kept[0][1] === 1) return [l];
    return kept.map(([t0, t1]) => ({ ...l, line: { start: at(t0), end: at(t1) } }));
  };
  // The joined elements' cut lines are trimmed to the joined outlines; any other line is cut back to what lies outside the joined
  // faces (a joined element's own edge at the joint, a line seen below the cut along the joint), whichever element it is of.
  const lines = drawing.lines.flatMap((l): L[] => (l.category === 'cut' ? (trimmed.has(l.entityId) ? (trimToBoundary(l, near) as L[]) : [l]) : outside(l)));
  return { ...drawing, cutPolygons: polygons.sort((a, b) => a.at - b.at).map((f) => f.p), lines };
}
