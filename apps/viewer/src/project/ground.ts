/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ground in an elevation or a section. A site or terrain model is a slab
 * of earth; drawn like a building element it reads as a green block. A
 * draughtsman draws the ground differently:
 *
 * - in an ELEVATION, one heavy line at the top of the terrain and nothing
 *   below it;
 * - in a SECTION, the ground where it is cut, in a plain earth tone, taken
 *   down only a short way below the lowest part of the building.
 *
 * Ground is every `IfcSite`, and an `IfcGeographicElement` (terrain, but
 * also trees) only when it spans most of the width of the rest of the
 * drawing, which a tree never does. Pure and deterministic; the generated
 * drawing is not changed.
 */

import type { Bounds2D, Drawing2D, DrawingLine, DrawingPolygon, Point2D } from '@ifc-lite/drawing-2d';

/** RGBA, 0..1: a pale earth tone for the cut ground. */
export const EARTH_TONE: [number, number, number, number] = [0.86, 0.8, 0.7, 1];
/** How far below the building the ground goes, as a share of the building's larger side. */
const DEPTH_SHARE = 0.06;
/** A geographic element is ground when it is this wide, as a share of everything else. */
const TERRAIN_SPAN = 0.6;
const EPS = 1e-6;

const upper = (t: string) => t.toUpperCase();

function groundEntities(drawing: Drawing2D): Set<string> {
  const ground = new Set<string>();
  const extents = new Map<string, [number, number]>();
  const key = (e: { entityId: number; modelIndex: number }) => `${e.modelIndex}:${e.entityId}`;
  const rest: [number, number] = [Infinity, -Infinity];
  const widen = (r: [number, number], x: number) => { r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); };
  const see = (e: { entityId: number; modelIndex: number; ifcType: string }, xs: number[]) => {
    const t = upper(e.ifcType);
    if (t === 'IFCSITE') { ground.add(key(e)); return; }
    if (t === 'IFCGEOGRAPHICELEMENT') {
      const r = extents.get(key(e)) ?? [Infinity, -Infinity];
      for (const x of xs) widen(r, x);
      extents.set(key(e), r);
      return;
    }
    for (const x of xs) widen(rest, x);
  };
  for (const l of drawing.lines) see(l, [l.line.start.x, l.line.end.x]);
  for (const p of drawing.cutPolygons) see(p, p.polygon.outer.map((q) => q.x));
  for (const p of drawing.projectionPolygons ?? []) see(p, p.polygon.outer.map((q) => q.x));
  for (const [k, r] of extents) if (Number.isFinite(rest[0]) ? r[1] - r[0] >= TERRAIN_SPAN * (rest[1] - rest[0]) : true) ground.add(k);
  return ground;
}

const keyOf = (e: { entityId: number; modelIndex: number }) => `${e.modelIndex}:${e.entityId}`;

function boundsOf(lines: DrawingLine[], polygons: DrawingPolygon[], fallback: Bounds2D): Bounds2D {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const take = (p: Point2D) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); };
  for (const l of lines) { take(l.line.start); take(l.line.end); }
  for (const p of polygons) p.polygon.outer.forEach(take);
  return Number.isFinite(minX) ? { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : fallback;
}

/** The y of a non-vertical segment at x, or null when x is outside it. */
function yAt(l: DrawingLine, x: number): number | null {
  const { start: a, end: b } = l.line;
  const lo = Math.min(a.x, b.x); const hi = Math.max(a.x, b.x);
  if (hi - lo < EPS || x < lo - EPS || x > hi + EPS) return null;
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

/** A straight stretch of the envelope, over x0 < x1. */
interface Piece { x0: number; y0: number; x1: number; y1: number }

const pieceY = (p: Piece, x: number) => p.y0 + ((p.y1 - p.y0) * (x - p.x0)) / (p.x1 - p.x0);

/** Appends `p` to `out`, joining it to the last piece when they are one straight line. */
function push(out: Piece[], p: Piece): void {
  if (p.x1 - p.x0 < 1e-12) return;
  const last = out[out.length - 1];
  if (last && Math.abs(last.x1 - p.x0) < 1e-12 && Math.abs(last.y1 - p.y0) < 1e-12 && Math.abs(pieceY(last, p.x1) - p.y1) < 1e-12) last.x1 = p.x1, last.y1 = p.y1;
  else out.push(p);
}

/** The higher of two envelopes, piece by piece over the breakpoints of both (crossings add one). */
function higher(a: readonly Piece[], b: readonly Piece[]): Piece[] {
  const xs = [...new Set([...a.flatMap((p) => [p.x0, p.x1]), ...b.flatMap((p) => [p.x0, p.x1])])].sort((u, v) => u - v);
  const out: Piece[] = [];
  let i = 0; let j = 0;
  for (let k = 0; k + 1 < xs.length; k++) {
    const u = xs[k]; const v = xs[k + 1];
    while (i < a.length && a[i].x1 <= u) i++;
    while (j < b.length && b[j].x1 <= u) j++;
    const pa = i < a.length && a[i].x0 <= u ? a[i] : null;
    const pb = j < b.length && b[j].x0 <= u ? b[j] : null;
    if (!pa && !pb) continue;
    if (!pa || !pb) {
      const p = (pa ?? pb) as Piece;
      push(out, { x0: u, y0: pieceY(p, u), x1: v, y1: pieceY(p, v) });
      continue;
    }
    const au = pieceY(pa, u); const av = pieceY(pa, v); const bu = pieceY(pb, u); const bv = pieceY(pb, v);
    if (au >= bu && av >= bv) push(out, { x0: u, y0: au, x1: v, y1: av });
    else if (bu >= au && bv >= av) push(out, { x0: u, y0: bu, x1: v, y1: bv });
    else {
      // They cross inside (u, v): the one that is higher at u first, the other after.
      const t = (au - bu) / (au - bu - (av - bv));
      const xc = u + (v - u) * t;
      const yc = au + (av - au) * t;
      const aFirst = au > bu;
      push(out, { x0: u, y0: aFirst ? au : bu, x1: xc, y1: yc });
      push(out, { x0: xc, y0: yc, x1: v, y1: aFirst ? bv : av });
    }
  }
  return out;
}

/** The upper envelope of the non-vertical segments of `lines`: the height of the highest one at every x, as sorted straight pieces; built once, queried in log time. */
function envelopeOf(lines: readonly DrawingLine[]): Piece[] {
  const pieces = lines.flatMap((l): Piece[] => {
    const a = l.line.start.x <= l.line.end.x ? l.line.start : l.line.end;
    const b = a === l.line.start ? l.line.end : l.line.start;
    return b.x - a.x < EPS ? [] : [{ x0: a.x, y0: a.y, x1: b.x, y1: b.y }];
  });
  const merge = (lo: number, hi: number): Piece[] => {
    if (hi - lo === 1) return [pieces[lo]];
    const mid = (lo + hi) >> 1;
    return higher(merge(lo, mid), merge(mid, hi));
  };
  return pieces.length === 0 ? [] : merge(0, pieces.length);
}

/** The height of the envelope at x (a hair of tolerance at its ends, as `yAt`), or null where there is none. */
function heightAt(envelope: readonly Piece[], x: number): number | null {
  let lo = 0; let hi = envelope.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (envelope[mid].x1 < x - EPS) lo = mid + 1; else hi = mid;
  }
  let top: number | null = null;
  for (let k = lo; k < envelope.length && envelope[k].x0 <= x + EPS; k++) {
    const p = envelope[k];
    const y = pieceY(p, Math.min(Math.max(x, p.x0), p.x1));
    if (top === null || y > top) top = y;
  }
  return top;
}

/** The segments of `lines` that nothing else in `lines` lies above: the top profile. */
function topProfile(lines: DrawingLine[]): DrawingLine[] {
  const envelope = envelopeOf(lines);
  return lines.filter((l) => {
    const a = l.line.start; const b = l.line.end;
    if (Math.abs(b.x - a.x) <= EPS) return false;
    for (const t of [0.25, 0.5, 0.75]) {
      const x = a.x + (b.x - a.x) * t;
      const y = yAt(l, x) as number;
      if ((heightAt(envelope, x) ?? -Infinity) > y + 1e-4) return false;
    }
    return true;
  });
}

/** `l` without the part of it that lies below the ground (the envelope of the top profile); null when none of it is above. */
function aboveGround(l: DrawingLine, ground: readonly Piece[]): DrawingLine | null {
  const { start: a, end: b } = l.line;
  const gap = (p: Point2D) => { const g = heightAt(ground, p.x); return g === null ? 1 : p.y - g; };
  const ga = gap(a); const gb = gap(b);
  if (ga >= -1e-4 && gb >= -1e-4) return l;
  if (ga < -1e-4 && gb < -1e-4) return null;
  let lo = 0; let hi = 1;
  const keepStart = ga >= 0;
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if ((gap(p) >= 0) === keepStart) lo = t; else hi = t;
  }
  const at = keepStart ? lo : hi;
  const p = { x: a.x + (b.x - a.x) * at, y: a.y + (b.y - a.y) * at };
  return { ...l, line: keepStart ? { start: a, end: p } : { start: p, end: b } };
}

/** How far the ground line runs past the building on each side, metres: a draughtsman stops it just beyond the walls, and a viewport's box is the drawing plus 10 mm each side, and the layout leaves 25 mm between drawings, so at 1:100 the boxes of two elevations just clear each other (#648). */
export const GROUND_OVERHANG_M = 0.2;

/** The part of `l` between x = `lo` and x = `hi`; null when none of it is. */
function clippedToX(l: DrawingLine, lo: number, hi: number): DrawingLine | null {
  const { start: a, end: b } = l.line;
  const t = (x: number) => (b.x === a.x ? 0 : (x - a.x) / (b.x - a.x));
  const [t0, t1] = [Math.max(0, Math.min(t(lo), t(hi))), Math.min(1, Math.max(t(lo), t(hi)))];
  if (b.x === a.x) return a.x >= lo && a.x <= hi ? l : null;
  if (t1 - t0 < 1e-9) return null;
  const at = (u: number) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  return t0 === 0 && t1 === 1 ? l : { ...l, line: { start: at(t0), end: at(t1) } };
}

/** An elevation: the ground's top profile as heavy lines, no ground below it and nothing of the building drawn below it. The line stops `GROUND_OVERHANG_M` past the building: a hill 21 m wide must not widen the drawing of a 6 m house (#648). */
function groundLineOnly(drawing: Drawing2D, groundIds: Set<string>): Drawing2D {
  const isGround = (e: { entityId: number; modelIndex: number }) => groundIds.has(keyOf(e));
  const mine = drawing.lines.filter((l) => isGround(l) && l.visibility !== 'hidden' && l.category !== 'hidden');
  const profile = topProfile(mine);
  const heavy = new Set(profile);
  const ground = envelopeOf(profile);
  const lines: DrawingLine[] = [];
  const building = boundsOf(drawing.lines.filter((l) => !isGround(l)), [...drawing.cutPolygons, ...(drawing.projectionPolygons ?? [])].filter((p) => !isGround(p)), drawing.bounds);
  const lo = building.min.x - GROUND_OVERHANG_M; const hi = building.max.x + GROUND_OVERHANG_M;
  for (const l of drawing.lines) {
    if (heavy.has(l)) {
      const kept = clippedToX(l, lo, hi);
      if (kept) lines.push({ ...kept, category: 'silhouette' as const });
    } else if (!isGround(l)) {
      const kept = aboveGround(l, ground);
      if (kept) lines.push(kept);
    }
  }
  const cutPolygons = drawing.cutPolygons.filter((p) => !isGround(p));
  const projectionPolygons = (drawing.projectionPolygons ?? []).filter((p) => !isGround(p));
  return { ...drawing, lines, cutPolygons, projectionPolygons, bounds: boundsOf(lines, [...cutPolygons, ...projectionPolygons], drawing.bounds) };
}

function clipAbove(ring: Point2D[], floor: number): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]; const b = ring[(i + 1) % ring.length];
    const ina = a.y >= floor; const inb = b.y >= floor;
    if (ina) out.push(a);
    if (ina !== inb) out.push({ x: a.x + ((b.x - a.x) * (floor - a.y)) / (b.y - a.y), y: floor });
  }
  return out.length >= 3 ? out : [];
}

/** A section: the cut ground in an earth tone, taken down to just below the building. */
function earthBelowBuilding(drawing: Drawing2D, ground: Set<string>): Drawing2D {
  const isGround = (e: { entityId: number; modelIndex: number }) => ground.has(keyOf(e));
  const others = drawing.lines.filter((l) => !isGround(l));
  if (others.length === 0) return drawing;
  const box = boundsOf(others, [], drawing.bounds);
  const floor = box.min.y - DEPTH_SHARE * Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
  const lines: DrawingLine[] = [];
  let template: DrawingLine | null = null;
  const bottom: DrawingLine[] = [];
  for (const l of drawing.lines) {
    if (!isGround(l)) { lines.push(l); continue; }
    const { start: a, end: b } = l.line;
    if (a.y < floor - EPS && b.y < floor - EPS) continue;
    if (l.category === 'cut') template = l;
    if (a.y >= floor - EPS && b.y >= floor - EPS) { lines.push(l); continue; }
    const t = (floor - a.y) / (b.y - a.y);
    const cut = { x: a.x + (b.x - a.x) * t, y: floor };
    lines.push({ ...l, line: a.y >= floor ? { start: a, end: cut } : { start: cut, end: b } });
  }
  const cutPolygons: DrawingPolygon[] = [];
  for (const p of drawing.cutPolygons) {
    if (!isGround(p)) { cutPolygons.push(p); continue; }
    const outer = clipAbove(p.polygon.outer, floor);
    if (outer.length === 0) continue;
    const holes = p.polygon.holes.map((h) => clipAbove(h, floor)).filter((h) => h.length > 0);
    cutPolygons.push({ ...p, polygon: { outer, holes }, color: [...EARTH_TONE] });
    const xs = outer.filter((q) => Math.abs(q.y - floor) < EPS).map((q) => q.x);
    if (xs.length >= 2 && template) bottom.push({ ...template, line: { start: { x: Math.min(...xs), y: floor }, end: { x: Math.max(...xs), y: floor } } });
  }
  const all = [...lines, ...bottom];
  return { ...drawing, lines: all, cutPolygons, bounds: boundsOf(all, cutPolygons, drawing.bounds) };
}

/** `drawing` with its ground drawn as `kind` of view should; the same object when there is none. */
export function drawingWithGround(drawing: Drawing2D, kind: 'elevation' | 'section'): Drawing2D {
  const ground = groundEntities(drawing);
  if (ground.size === 0) return drawing;
  return kind === 'elevation' ? groundLineOnly(drawing, ground) : earthBelowBuilding(drawing, ground);
}
