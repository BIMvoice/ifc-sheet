/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the user drew on a joinery type's front, plan and section (#492). The shapes live on the type (`JoinerySpec.view.drafts`), in
 * the view's own frame (metres, the type frame of the views: origin in the middle of the footprint at the lowest point), so they follow
 * the type: every schedule that shows it prints them, a project file keeps them, and a model update that moves the window leaves them
 * where they are on the type's view, since the views are cut in that same frame.
 *
 * One copy for the app's schedule card and a headless build: `joineryViewDraftPrims` turns the stored shapes into strokes and text in the
 * view's metres, and the caller maps them onto its paper. Arcs and circles are flattened to polylines, a hatch to diagonal lines at its
 * angle and scale (the pattern's name is not drawn in a schedule). A line type that is not continuous prints dashed.
 */

import type { JoineryDraftShape, JoineryViewDraft, JoineryViewDrafts, JoinerySpec } from '@ifc-lite/create';
import type { JoineryViewName } from './joinery-view-detail.js';

interface P { x: number; y: number }

export type JoineryDraftPrim =
  | { kind: 'path'; pts: P[]; closed: boolean; weight: number; dashed: boolean }
  | { kind: 'text'; at: P; text: string; height: number; rotation: number };

const VIEW_NAMES: readonly JoineryViewName[] = ['front', 'plan', 'section'];
const MAX_PER_VIEW = 5000;
const DEFAULT_WEIGHT = 0.25;
const HATCH_WEIGHT = 0.13;
const MAX_HATCH_LINES = 4000;
/** Paper millimetres between hatch lines at scale 1. */
const HATCH_SPACING_MM = 2;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown): v is P => isObject(v) && isNum(v.x) && isNum(v.y);
const isPts = (v: unknown, min: number): v is P[] => Array.isArray(v) && v.length >= min && v.every(isPt);

/** True when `shape` has what its type needs to be drawn. */
function drawable(shape: Record<string, unknown>): boolean {
  switch (shape.type) {
    case 'line': return isPt(shape.a) && isPt(shape.b);
    case 'polyline': return isPts(shape.pts, 2);
    case 'circle': return isPt(shape.c) && isNum(shape.r) && shape.r > 0;
    case 'arc': return isPt(shape.c) && isNum(shape.r) && shape.r > 0 && isNum(shape.start) && isNum(shape.end);
    case 'text': return isPt(shape.p) && typeof shape.text === 'string' && isNum(shape.height) && shape.height > 0;
    case 'hatch': return Array.isArray(shape.loops) && shape.loops.length > 0 && shape.loops.every((l) => isPts(l, 3));
    default: return false;
  }
}

/** Whether a drafting shape type is one a schedule prints. */
export const isJoineryDraftType = (type: string): boolean => ['line', 'polyline', 'circle', 'arc', 'text', 'hatch'].includes(type);

/** Reads stored drafts tolerantly: an entry that is not a drawable line, polyline, circle, arc, text or hatch is dropped. */
export function readJoineryViewDrafts(raw: unknown): JoineryViewDrafts | undefined {
  if (!isObject(raw)) return undefined;
  const out: JoineryViewDrafts = {};
  for (const view of VIEW_NAMES) {
    const list = raw[view];
    if (!Array.isArray(list)) continue;
    const kept = list.slice(0, MAX_PER_VIEW).flatMap((d): JoineryViewDraft[] => {
      if (!isObject(d) || typeof d.id !== 'string' || !isObject(d.shape) || !drawable(d.shape)) return [];
      return [{
        id: d.id, shape: JSON.parse(JSON.stringify(d.shape)) as JoineryDraftShape,
        ...(typeof d.layerId === 'string' ? { layerId: d.layerId } : {}),
        ...(isNum(d.weight) && d.weight > 0 ? { weight: d.weight } : {}),
        ...(d.lineType === 'dashed' || d.lineType === 'dotted' || d.lineType === 'dashdot' ? { lineType: d.lineType } : {}),
        ...(isObject(d.params) ? { params: Object.fromEntries(Object.entries(d.params).filter(([, v]) => typeof v === 'string' || typeof v === 'boolean' || isNum(v))) as Record<string, string | number | boolean> } : {}),
      }];
    });
    if (kept.length) out[view] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The drafts of one view of `spec`. */
export const joineryViewDrafts = (spec: Pick<JoinerySpec, 'view'> | null | undefined, view: JoineryViewName): readonly JoineryViewDraft[] => spec?.view?.drafts?.[view] ?? [];

/** The type with `drafts` as what its `view` shows drawn on it; an empty list takes the view's drafts away. */
export function withViewDrafts(spec: JoinerySpec, view: JoineryViewName, drafts: readonly JoineryViewDraft[]): JoinerySpec {
  const next: JoineryViewDrafts = { ...spec.view?.drafts };
  if (drafts.length) next[view] = [...drafts]; else delete next[view];
  const { view: old, ...rest } = spec;
  const choice = { ...old };
  if (Object.keys(next).length) choice.drafts = next; else delete choice.drafts;
  return Object.keys(choice).length ? { ...rest, view: choice } : rest;
}

const TAU = Math.PI * 2;

function arcPts(c: P, r: number, start: number, sweep: number): P[] {
  const n = Math.max(8, Math.ceil((Math.abs(sweep) / TAU) * 72));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + r * Math.cos(start + (sweep * i) / n), y: c.y + r * Math.sin(start + (sweep * i) / n) }));
}

/** Diagonal lines at `angleDeg`, `spacing` metres apart, inside the loops (even-odd), as segments. */
function hatchLines(loops: readonly (readonly P[])[], angleDeg: number, spacing: number): [P, P][] {
  const a = (angleDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // In the hatch's own frame (rotated by -angle) the lines are horizontal.
  const rot = loops.map((l) => l.map((p) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c })));
  const ys = rot.flat().map((p) => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const out: [P, P][] = [];
  const back = (x: number, y: number): P => ({ x: x * c - y * s, y: x * s + y * c });
  for (let y = Math.ceil(lo / spacing) * spacing + spacing / 2; y < hi; y += spacing) {
    const xs: number[] = [];
    for (const l of rot) {
      for (let i = 0; i < l.length; i++) {
        const p = l[i], q = l[(i + 1) % l.length];
        if ((p.y <= y) === (q.y <= y)) continue;
        xs.push(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));
      }
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-9) out.push([back(xs[i], y), back(xs[i + 1], y)]);
  }
  return out;
}

/**
 * The strokes and text of a view's drafts, in the view's metres. `k` is the paper millimetres per metre the schedule draws the view
 * at (it sets the spacing of a hatch to the same distance on paper at any scale).
 */
export function joineryViewDraftPrims(drafts: readonly JoineryViewDraft[], k: number): JoineryDraftPrim[] {
  const out: JoineryDraftPrim[] = [];
  for (const d of drafts) {
    const sh = d.shape as Record<string, unknown>;
    if (!drawable(sh)) continue;
    const pen = { weight: d.weight ?? DEFAULT_WEIGHT, dashed: d.lineType !== undefined };
    const path = (pts: P[], closed = false) => out.push({ kind: 'path', pts, closed, ...pen });
    switch (sh.type) {
      case 'line': path([sh.a as P, sh.b as P]); break;
      case 'polyline': path(sh.pts as P[], sh.closed === true && (sh.pts as P[]).length > 2); break;
      case 'circle': path(arcPts(sh.c as P, sh.r as number, 0, TAU).slice(0, -1), true); break;
      case 'arc': {
        let sweep = (sh.end as number) - (sh.start as number);
        sweep = ((sweep % TAU) + TAU) % TAU || TAU;
        path(arcPts(sh.c as P, sh.r as number, sh.start as number, sweep));
        break;
      }
      case 'text':
        out.push({ kind: 'text', at: sh.p as P, text: sh.text as string, height: sh.height as number, rotation: isNum(sh.rotation) ? sh.rotation : 0 });
        break;
      case 'hatch': {
        const loops = sh.loops as P[][];
        const spacing = (HATCH_SPACING_MM / Math.max(k, 1e-6)) * (isNum(sh.scale) && sh.scale > 0 ? sh.scale : 1);
        for (const [a, b] of hatchLines(loops, isNum(sh.angle) ? sh.angle : 0, spacing).slice(0, MAX_HATCH_LINES)) out.push({ kind: 'path', pts: [a, b], closed: false, weight: HATCH_WEIGHT, dashed: false });
        break;
      }
    }
  }
  return out;
}
