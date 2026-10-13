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

/** The segments of `lines` that nothing else in `lines` lies above: the top profile. */
function topProfile(lines: DrawingLine[]): DrawingLine[] {
  const open = lines.filter((l) => Math.abs(l.line.end.x - l.line.start.x) > EPS);
  return open.filter((l) => {
    const a = l.line.start; const b = l.line.end;
    for (const t of [0.25, 0.5, 0.75]) {
      const x = a.x + (b.x - a.x) * t;
      const y = yAt(l, x) as number;
      if (open.some((o) => o !== l && (yAt(o, x) ?? -Infinity) > y + 1e-4)) return false;
    }
    return true;
  });
}

/** The height of the ground's top profile at x, or null where there is no ground. */
function groundAt(profile: readonly DrawingLine[], x: number): number | null {
  let top: number | null = null;
  for (const l of profile) {
    const y = yAt(l, x);
    if (y !== null && (top === null || y > top)) top = y;
  }
  return top;
}

/** `l` without the part of it that lies below the ground; null when none of it is above. */
function aboveGround(l: DrawingLine, profile: readonly DrawingLine[]): DrawingLine | null {
  const { start: a, end: b } = l.line;
  const gap = (p: Point2D) => { const g = groundAt(profile, p.x); return g === null ? 1 : p.y - g; };
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

/** An elevation: the ground's top profile as heavy lines, no ground below it and nothing of the building drawn below it. */
function groundLineOnly(drawing: Drawing2D, ground: Set<string>): Drawing2D {
  const isGround = (e: { entityId: number; modelIndex: number }) => ground.has(keyOf(e));
  const mine = drawing.lines.filter((l) => isGround(l) && l.visibility !== 'hidden' && l.category !== 'hidden');
  const profile = topProfile(mine);
  const heavy = new Set(profile);
  const lines: DrawingLine[] = [];
  for (const l of drawing.lines) {
    if (heavy.has(l)) lines.push({ ...l, category: 'silhouette' as const });
    else if (!isGround(l)) {
      const kept = aboveGround(l, profile);
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
