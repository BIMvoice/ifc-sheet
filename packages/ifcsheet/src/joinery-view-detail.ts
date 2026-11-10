/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The detail level and hidden lines of a joinery type's schedule views (#449). One copy, so the app's schedule card and a headless
 * build draw the same lines from the same choice. The choice lives on the type (`JoinerySpec.view`) and so reaches every schedule
 * that shows the type.
 *
 * A line's identity is its geometry in the type's own frame (the view's metres, origin in the middle of the footprint at the
 * lowest point), rounded to the millimetre, with its end points in a fixed order. An index would shift whenever the cutter returns
 * the lines in another order; a position survives a reload and a model update that leaves the type's shape alone, and a changed
 * shape is a different line, so a hidden line never silently hides something else.
 *
 * The cutter merges collinear segments, and where members overlap it may merge them as one run in one cut and as pieces in
 * another, with the same shape. So a line is hidden when it lies within a hidden segment (both end points within 1 mm of it), not
 * only when the ids are equal: a hidden run hides its pieces. A hidden piece does not hide the longer run it later merges into.
 *
 * Detail levels: `all` keeps everything cut; `frame` drops lines shorter than half the narrower of the frame and sash members
 * (rebates, beads, hardware); `outline` keeps only the lines on the view's bounding box and no hatching.
 */

import type { JoineryViewChoice, JoineryViewDetail, JoinerySpec } from '@ifc-lite/create';
import { readJoineryViewDrafts } from './joinery-view-drafts.js';

export type JoineryViewName = 'front' | 'plan' | 'section';

interface P { x: number; y: number }
/** The shape of a line the app's cutter returns (`ViewLine`); `hatch` fills cut faces and is not a line to pick. */
export interface JoineryViewLineLike { a: P; b: P; kind: string }

export const JOINERY_VIEW_DETAILS: readonly JoineryViewDetail[] = ['outline', 'frame', 'all'];

const mm = (m: number): number => Math.round(m * 1000) + 0;

/** `front:-600,0,600,0`: the view and the line's end points in millimetres, the lesser (x, then y) first. */
export function joineryViewLineId(view: JoineryViewName, a: P, b: P): string {
  const p = { x: mm(a.x), y: mm(a.y) }, q = { x: mm(b.x), y: mm(b.y) };
  const [first, second] = p.x < q.x || (p.x === q.x && p.y <= q.y) ? [p, q] : [q, p];
  return `${view}:${first.x},${first.y},${second.x},${second.y}`;
}

export const JOINERY_LINE_ID = /^(front|plan|section):-?\d+,-?\d+,-?\d+,-?\d+$/;

interface Seg { view: string; ax: number; ay: number; bx: number; by: number }

function parseId(id: string): Seg | null {
  if (!JOINERY_LINE_ID.test(id)) return null;
  const [view, rest] = id.split(':');
  const [ax, ay, bx, by] = rest.split(',').map(Number);
  return { view, ax, ay, bx, by };
}

/** Distance (mm) from point (x, y) to segment `s`. */
function distance(s: Seg, x: number, y: number): number {
  const dx = s.bx - s.ax, dy = s.by - s.ay, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / len2));
  return Math.hypot(x - (s.ax + t * dx), y - (s.ay + t * dy));
}

const length = (l: JoineryViewLineLike): number => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

/** The lines of `view` the type's choice draws, in their original order. Hatching is kept or dropped with the level, never hidden singly. */
export function joineryViewLines<L extends JoineryViewLineLike>(view: JoineryViewName, lines: readonly L[], spec: Pick<JoinerySpec, 'frame' | 'sash' | 'view'> | null): L[] {
  const choice = spec?.view;
  if (!spec || !choice) return [...lines];
  const detail = choice.detail ?? 'all';
  const hidden = new Set(choice.hidden ?? []);
  const runs = [...hidden].flatMap((id) => { const r = parseId(id); return r && r.view === view ? [r] : []; });
  const isHidden = (l: JoineryViewLineLike): boolean => {
    if (hidden.has(joineryViewLineId(view, l.a, l.b))) return true;
    const a = { x: l.a.x * 1000, y: l.a.y * 1000 }, b = { x: l.b.x * 1000, y: l.b.y * 1000 };
    return runs.some((r) => distance(r, a.x, a.y) <= 1 && distance(r, b.x, b.y) <= 1);
  };
  const solid = lines.filter((l) => l.kind !== 'hatch');
  const min = { x: Math.min(...solid.map((l) => Math.min(l.a.x, l.b.x))), y: Math.min(...solid.map((l) => Math.min(l.a.y, l.b.y))) };
  const max = { x: Math.max(...solid.map((l) => Math.max(l.a.x, l.b.x))), y: Math.max(...solid.map((l) => Math.max(l.a.y, l.b.y))) };
  const tol = 0.0005;
  const onEdge = (l: JoineryViewLineLike): boolean =>
    [min.x, max.x].some((x) => Math.abs(l.a.x - x) < tol && Math.abs(l.b.x - x) < tol)
    || [min.y, max.y].some((y) => Math.abs(l.a.y - y) < tol && Math.abs(l.b.y - y) < tol);
  const small = Math.min(spec.frame.width, spec.sash.width) / 2;
  return lines.filter((l) => {
    if (l.kind === 'hatch') return detail !== 'outline';
    if (isHidden(l)) return false;
    if (detail === 'outline') return onEdge(l);
    if (detail === 'frame') return length(l) >= small;
    return true;
  });
}

const clean = (c: JoineryViewChoice): JoineryViewChoice | undefined => {
  const out: JoineryViewChoice = {};
  if (c.detail && c.detail !== 'all') out.detail = c.detail;
  if (c.hidden?.length) out.hidden = [...new Set(c.hidden)].sort();
  if (c.drafts && Object.keys(c.drafts).length) out.drafts = c.drafts;
  return out.detail || out.hidden || out.drafts ? out : undefined;
};

function withChoice(spec: JoinerySpec, choice: JoineryViewChoice): JoinerySpec {
  const { view: _old, ...rest } = spec;
  const view = clean(choice);
  return view ? { ...rest, view } : rest;
}

/** The type with its views at `detail` (hidden lines kept). */
export const withViewDetail = (spec: JoinerySpec, detail: JoineryViewDetail): JoinerySpec => withChoice(spec, { ...spec.view, detail });
/** The type with line `id` hidden in its views. */
export const withViewLineHidden = (spec: JoinerySpec, id: string): JoinerySpec => withChoice(spec, { ...spec.view, hidden: [...(spec.view?.hidden ?? []), id] });
/** The type with every hidden line shown again (the detail level kept). */
export const withHiddenLinesShown = (spec: JoinerySpec): JoinerySpec => withChoice(spec, { ...spec.view, hidden: [] });

/** Reads a stored choice tolerantly: an unknown level or a malformed id is dropped. */
export function readJoineryViewChoice(raw: unknown): JoineryViewChoice | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const detail = JOINERY_VIEW_DETAILS.includes(r.detail as JoineryViewDetail) ? (r.detail as JoineryViewDetail) : undefined;
  const hidden = Array.isArray(r.hidden) ? r.hidden.filter((h): h is string => typeof h === 'string' && JOINERY_LINE_ID.test(h)).slice(0, 2000) : [];
  return clean({ detail, hidden, drafts: readJoineryViewDrafts(r.drafts) });
}
