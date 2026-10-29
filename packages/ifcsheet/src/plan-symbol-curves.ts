/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The 2D items of a plan symbol representation, read from the parsed entities as polylines (`plan-symbols.ts`):
 * IfcPolyline, IfcIndexedPolyCurve (straight and arc segments), IfcCircle and IfcEllipse (whole), IfcTrimmedCurve over a
 * circle, ellipse or line, IfcCompositeCurve, IfcAnnotationFillArea (its boundaries, as outlines), IfcGeometricSet /
 * IfcGeometricCurveSet, and IfcMappedItem (through its map's origin and its target operator).
 *
 * Not read, and left out rather than guessed: trims of any other basis curve (a trimmed polyline, B-spline, offset curve),
 * B-spline and rational curves, swept-area solids, text literals, the hatching of a fill area, and styles (a symbol's
 * pen is the view's, not the file's). An item of those kinds is counted in `skipped`.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import { apply, axisFrame, compose, coords, invertRigid, operatorFrame, ref, type P3, type Xf } from './plan-symbol-frame.js';

export interface CurveContext {
  store: IfcDataStore;
  /** Radians per file plane-angle unit (`planeAngleScale`). */
  angle: number;
  /** The item classes that were not read. */
  skipped: Set<string>;
}

/** A polyline in the item's own frame. */
type Line = P3[];

const MAX_DEPTH = 8;
/** The largest angle one tessellated chord of an arc spans. */
const STEP = Math.PI / 24;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => {
  const n = Array.isArray(v) ? v[1] : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

function arc(centre: P3, a: number, b: number, from: number, to: number, frame: Xf): Line {
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / STEP));
  const out: Line = [];
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    out.push(apply(frame, { x: centre.x + a * Math.cos(t), y: centre.y + b * Math.sin(t), z: 0 }));
  }
  return out;
}

/** The arc through three points (an IfcArcIndex: start, a point on it, end), by its circumcircle. */
function arcThrough(p: P3, q: P3, r: P3): Line {
  const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y));
  if (Math.abs(d) < 1e-12) return [p, r];
  const sq = (v: P3) => v.x * v.x + v.y * v.y;
  const cx = (sq(p) * (q.y - r.y) + sq(q) * (r.y - p.y) + sq(r) * (p.y - q.y)) / d;
  const cy = (sq(p) * (r.x - q.x) + sq(q) * (p.x - r.x) + sq(r) * (q.x - p.x)) / d;
  const radius = Math.hypot(p.x - cx, p.y - cy);
  const at = (v: P3) => Math.atan2(v.y - cy, v.x - cx);
  const a0 = at(p), am = at(q);
  let a1 = at(r);
  // Go from p to r through q: counter-clockwise when q lies at a counter-clockwise offset from p before r does.
  const tau = Math.PI * 2;
  const ccw = ((am - a0 + tau) % tau) < ((a1 - a0 + tau) % tau);
  if (ccw) { while (a1 <= a0) a1 += tau; } else { while (a1 >= a0) a1 -= tau; }
  const out = arc({ x: cx, y: cy, z: p.z }, radius, radius, a0, a1, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  out[0] = p;
  out[out.length - 1] = r;
  return out;
}

/** Points of a point-list entity (IfcCartesianPointList2D / 3D), the list's own coordinates. */
function pointList(ctx: CurveContext, id: number | null): P3[] | null {
  const entity = id === null ? null : ctx.store.getEntity(id);
  const rows = list(entity?.attributes?.[0]);
  if (!entity || rows.length === 0) return null;
  const out: P3[] = [];
  for (const row of rows) {
    const r = list(row);
    const x = num(r[0]), y = num(r[1]);
    if (x === null || y === null) return null;
    out.push({ x, y, z: r.length > 2 ? num(r[2]) ?? 0 : 0 });
  }
  return out;
}

function indexedPolyCurve(ctx: CurveContext, attrs: unknown[]): Line | null {
  const pts = pointList(ctx, ref(attrs[0]));
  if (!pts) return null;
  const segments = list(attrs[1]);
  if (segments.length === 0) return pts;
  const out: Line = [];
  const push = (p: P3) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) out.push(p);
  };
  for (const segment of segments) {
    const kind = Array.isArray(segment) ? String(segment[0]).toUpperCase() : '';
    const idx = list(Array.isArray(segment) ? segment[1] : null).map((i) => (typeof i === 'number' ? pts[i - 1] : undefined));
    if (idx.some((p) => !p)) return null;
    const p = idx as P3[];
    if (kind === 'IFCARCINDEX' && p.length === 3) for (const q of arcThrough(p[0], p[1], p[2])) push(q);
    else for (const q of p) push(q);
  }
  return out;
}

/** A trim's parameter on a circle / ellipse of radii (a, b) in its own frame, from a parameter value or a point. */
function trimParameter(ctx: CurveContext, trims: unknown[], preferPoint: boolean, a: number, b: number, frame: Xf): number | null {
  const param = trims.map((t) => (Array.isArray(t) && typeof t[0] === 'string' && /PARAMETER/i.test(t[0]) ? num(t) : null)).find((n) => n !== null) ?? null;
  const point = trims.map((t) => (typeof t === 'number' ? coords(ctx.store, t) : null)).find((c) => c !== null) ?? null;
  if (point && (preferPoint || param === null)) {
    const local = apply(invertRigid(frame), { x: point[0], y: point[1], z: point[2] });
    return Math.atan2(local.y / b, local.x / a);
  }
  return param === null ? null : param * ctx.angle;
}

function basisPlacement(ctx: CurveContext, curve: { attributes?: unknown[] }): Xf | null {
  return axisFrame(ctx.store, ref(curve.attributes?.[0]));
}

function trimmed(ctx: CurveContext, attrs: unknown[]): Line | null {
  const basisId = ref(attrs[0]);
  const basis = basisId === null ? null : ctx.store.getEntity(basisId);
  if (!basis) return null;
  const type = String(basis.type).toUpperCase();
  const t1 = list(attrs[1]), t2 = list(attrs[2]);
  const sense = String(attrs[3]).toUpperCase() !== '.F.';
  const preferPoint = String(attrs[4]).toUpperCase() === '.CARTESIAN.';
  if (type === 'IFCCIRCLE' || type === 'IFCELLIPSE') {
    const frame = basisPlacement(ctx, basis);
    const a = num(basis.attributes?.[1]);
    const b = type === 'IFCELLIPSE' ? num(basis.attributes?.[2]) : a;
    if (!frame || !a || !b) return null;
    const from = trimParameter(ctx, t1, preferPoint, a, b, frame);
    let to = trimParameter(ctx, t2, preferPoint, a, b, frame);
    if (from === null || to === null) return null;
    const tau = Math.PI * 2;
    if (sense) { while (to <= from) to += tau; } else { while (to >= from) to -= tau; }
    return arc({ x: 0, y: 0, z: 0 }, a, b, from, to, frame);
  }
  if (type === 'IFCLINE') {
    const origin = coords(ctx.store, ref(basis.attributes?.[0]));
    const vector = ctx.store.getEntity(ref(basis.attributes?.[1]) ?? -1);
    const dir = coords(ctx.store, ref(vector?.attributes?.[0]));
    const magnitude = num(vector?.attributes?.[1]) ?? 1;
    if (!origin || !dir) return null;
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const at = (trims: unknown[]): P3 | null => {
      const point = trims.map((t) => (typeof t === 'number' ? coords(ctx.store, t) : null)).find((c) => c !== null);
      if (point && (preferPoint || trims.every((t) => typeof t === 'number'))) return { x: point[0], y: point[1], z: point[2] };
      const param = trims.map((t) => (Array.isArray(t) ? num(t) : null)).find((n) => n !== null);
      return param == null ? null : { x: origin[0] + (dir[0] / len) * magnitude * param, y: origin[1] + (dir[1] / len) * magnitude * param, z: origin[2] + (dir[2] / len) * magnitude * param };
    };
    const p = at(t1), q = at(t2);
    return p && q ? [p, q] : null;
  }
  return null;
}

function composite(ctx: CurveContext, attrs: unknown[], depth: number): Line | null {
  const out: Line = [];
  for (const segmentId of list(attrs[0])) {
    const segment = ctx.store.getEntity(ref(segmentId) ?? -1);
    const parent = segment ? curve(ctx, ref(segment.attributes?.[2]), depth + 1) : null;
    if (!parent) return null;
    const line = String(segment?.attributes?.[1]).toUpperCase() === '.F.' ? [...parent].reverse() : parent;
    for (const p of line) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) out.push(p);
    }
  }
  return out.length >= 2 ? out : null;
}

/** One curve entity as a polyline in its own frame, or null (counted in `skipped`) when it is not a kind this reads. */
export function curve(ctx: CurveContext, id: number | null, depth = 0): Line | null {
  const entity = id === null || depth > MAX_DEPTH ? null : ctx.store.getEntity(id);
  if (!entity) return null;
  const type = String(entity.type).toUpperCase();
  const attrs = entity.attributes ?? [];
  let line: Line | null = null;
  switch (type) {
    case 'IFCPOLYLINE': {
      const pts = list(attrs[0]).map((p) => coords(ctx.store, ref(p)));
      line = pts.every((p) => p !== null) ? (pts as [number, number, number][]).map(([x, y, z]) => ({ x, y, z })) : null;
      break;
    }
    case 'IFCINDEXEDPOLYCURVE': line = indexedPolyCurve(ctx, attrs); break;
    case 'IFCTRIMMEDCURVE': line = trimmed(ctx, attrs); break;
    case 'IFCCOMPOSITECURVE': line = composite(ctx, attrs, depth); break;
    case 'IFCCIRCLE':
    case 'IFCELLIPSE': {
      const frame = basisPlacement(ctx, entity);
      const a = num(attrs[1]), b = type === 'IFCELLIPSE' ? num(attrs[2]) : a;
      line = frame && a && b ? arc({ x: 0, y: 0, z: 0 }, a, b, 0, Math.PI * 2, frame) : null;
      break;
    }
    default: break;
  }
  if (!line || line.length < 2) {
    ctx.skipped.add(type);
    return null;
  }
  return line;
}

/**
 * Every polyline of representation item `id`, through `xf` (the frame that places the representation).
 * Appends to `out`; items of an unread kind are counted in `ctx.skipped`.
 */
export function readItem(ctx: CurveContext, id: number | null, xf: Xf, out: Line[], depth = 0): void {
  const item = id === null || depth > MAX_DEPTH ? null : ctx.store.getEntity(id);
  if (!item) return;
  const type = String(item.type).toUpperCase();
  const attrs = item.attributes ?? [];
  const put = (line: Line | null) => { if (line) out.push(line.map((p) => apply(xf, p))); };
  switch (type) {
    case 'IFCGEOMETRICSET':
    case 'IFCGEOMETRICCURVESET':
      for (const e of list(attrs[0])) readItem(ctx, ref(e), xf, out, depth + 1);
      return;
    case 'IFCANNOTATIONFILLAREA': {
      for (const boundary of [attrs[0], ...list(attrs[1])]) {
        const line = curve(ctx, ref(boundary), depth + 1);
        if (line) {
          const first = line[0], last = line[line.length - 1];
          put(Math.hypot(first.x - last.x, first.y - last.y) > 1e-9 ? [...line, first] : line);
        }
      }
      return;
    }
    case 'IFCMAPPEDITEM': {
      const map = ctx.store.getEntity(ref(attrs[0]) ?? -1);
      const origin = map ? axisFrame(ctx.store, ref(map.attributes?.[0])) : null;
      const target = operatorFrame(ctx.store, ref(attrs[1]));
      const mapped = map ? ctx.store.getEntity(ref(map.attributes?.[1]) ?? -1) : null;
      if (!map || !target || !mapped) { ctx.skipped.add(type); return; }
      const inner = compose(xf, compose(target, origin ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]));
      for (const e of list(mapped.attributes?.[3])) readItem(ctx, ref(e), inner, out, depth + 1);
      return;
    }
    default: put(curve(ctx, id, depth + 1));
  }
}
