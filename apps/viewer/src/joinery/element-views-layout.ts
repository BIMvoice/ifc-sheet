/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The views of `element-views.ts` as schedule primitives: a card's front view
 * with its opening symbol overlaid, the plan under it and the section beside
 * it, all at the schedule's scale (`k` paper millimetres per metre).
 */

import { normalisedPanels, panelRect, type JoinerySpec } from '@ifc-lite/create';
import type { ElementView, ElementViews, ViewLine } from './element-views';
import { openingMarks, type OpeningConvention } from './symbols';
import { blockPlanStrokes, joineryViewDraftPrims, joineryViewDrafts, joineryViewLineId, joineryViewLines } from '@bimvoice/ifcsheet/project';
import type { SchedulePrim } from './schedule-layout';

type ViewName = 'front' | 'plan' | 'section';

const PEN = { cut: 0.35, outline: 0.25, thin: 0.13 } as const;

const penOf = (l: ViewLine) => (l.kind === 'cut' ? PEN.cut : l.kind === 'seen' ? PEN.outline : PEN.thin);

/** Paper millimetres a card needs beside the front view for the section. */
export const sectionRoom = (v: ElementViews, k: number): number => v.depth * k + 8;
/** Paper millimetres a card needs under the front view's dimension line for the plan. */
export const planRoom = (v: ElementViews, k: number, spec: JoinerySpec | null = null): number => planFrame(v, spec, k).room;

/**
 * Where the plan stands under the front view's floor line, in paper millimetres: `mid` is the plan's origin below it and `room` what the
 * card reserves from the floor line. The model's plan is the frame depth, centred. A type's DXF block (#448) is the extent of its own
 * strokes, scaled and mirrored as they print (`blockPlanStrokes`), swing arc included, so the card reserves what the symbol draws.
 */
export function planFrame(v: ElementViews, spec: JoinerySpec | null, k: number): { mid: number; room: number } {
  let up = v.depth / 2;
  let down = v.depth / 2;
  for (const s of (spec ? blockPlanStrokes(spec) : null) ?? []) {
    for (const q of s.pts) {
      up = Math.max(up, q.y);
      down = Math.max(down, -q.y);
    }
  }
  return { mid: 10 + up * k, room: 10 + (up + down) * k };
}

/**
 * A view's lines as primitives, after the type's detail level and hidden lines (`joineryViewLines`, the engine's). Each line that can
 * be hidden carries its id and the type's, so the schedule tab can pick it.
 */
function linesOf(view: ElementView, name: ViewName, at: (x: number, y: number) => { x: number; y: number }, spec: JoinerySpec | null): SchedulePrim[] {
  return joineryViewLines(name, view.lines, spec).map((l): SchedulePrim => ({
    kind: 'path', pts: [at(l.a.x, l.a.y), at(l.b.x, l.b.y)], w: penOf(l), dashed: l.kind === 'hidden', view: name,
    ...(spec?.id && l.kind !== 'hatch' ? { pick: { type: spec.id, line: joineryViewLineId(name, l.a, l.b) } } : {}),
  }));
}

/** The type's imported plan block (#448) as primitives in place of the plan cut from the model, in the type frame; null when the type has none. */
function planBlockPrims(spec: JoinerySpec | null, at: (x: number, y: number) => { x: number; y: number }): SchedulePrim[] | null {
  const strokes = spec ? blockPlanStrokes(spec) : null;
  return strokes?.map((s): SchedulePrim => ({ kind: 'path', pts: s.pts.map((q) => at(q.x, q.y)), closed: s.closed, w: s.weight === 'cut' ? PEN.cut : PEN.outline, dashed: s.dashed, view: 'plan' })) ?? null;
}

/**
 * What the user drew on a type's view (#492), as primitives. The strokes and text come from the engine (`joineryViewDraftPrims`), so
 * a headless build prints the same; `at` puts the view's metres on the paper.
 */
function draftsOf(spec: JoinerySpec | null, name: ViewName, at: (x: number, y: number) => { x: number; y: number }, k: number): SchedulePrim[] {
  return joineryViewDraftPrims(joineryViewDrafts(spec, name), k).map((p): SchedulePrim => {
    if (p.kind === 'text') {
      const o = at(p.at.x, p.at.y);
      // A rotation counts counter-clockwise in the view (y up); the paper's y runs down.
      return { kind: 'text', x: o.x, y: o.y, text: p.text, size: p.height * k, anchor: 'start', view: name, ...(p.rotation ? { rotate: (-p.rotation * 180) / Math.PI } : {}) };
    }
    return { kind: 'path', pts: p.pts.map((q) => at(q.x, q.y)), closed: p.closed, w: p.weight, dashed: p.dashed, view: name };
  });
}

/** A card's views on the paper: the box of each (paper millimetres), for picking one with the pointer. */
export interface ViewRegion { type: string; view: ViewName; box: { x: number; y: number; w: number; h: number } }

/** Where each of a card's views stands, as `viewPrims` places them (the lines' own extent, with a margin to grab the drafts beside it). */
export function viewRegions(v: ElementViews, spec: JoinerySpec | null, at: { fx: number; base: number }, k: number): ViewRegion[] {
  if (!spec?.id) return [];
  const { fx, base } = at;
  const planMid = base + planFrame(v, spec, k).mid;
  const sectionMid = fx + (v.width * k) / 2 + 8 + (v.depth * k) / 2;
  const pad = 4;
  const region = (view: ViewName, e: ElementView, ox: number, oy: number): ViewRegion => ({
    type: spec.id!, view,
    box: { x: ox + e.min.x * k - pad, y: oy - e.max.y * k - pad, w: (e.max.x - e.min.x) * k + 2 * pad, h: (e.max.y - e.min.y) * k + 2 * pad },
  });
  return [region('front', v.front, fx, base), region('plan', v.plan, fx, planMid), region('section', v.section, sectionMid, base)];
}

/**
 * Where a card puts its views. `fx` is the front view's horizontal middle and
 * `base` its floor line (paper y); the plan hangs under the width dimension
 * (`base + 4.5`), the section stands beside the front, on the same floor line.
 */
export function viewPrims(
  v: ElementViews,
  spec: JoinerySpec | null,
  at: { fx: number; base: number },
  k: number,
  convention: OpeningConvention,
): SchedulePrim[] {
  const { fx, base } = at;
  const planMid = base + planFrame(v, spec, k).mid;
  const sectionMid = fx + (v.width * k) / 2 + 8 + (v.depth * k) / 2;
  const out: SchedulePrim[] = [
    ...linesOf(v.front, 'front', (x, y) => ({ x: fx + x * k, y: base - y * k }), spec),
    ...(planBlockPrims(spec, (x, y) => ({ x: fx + x * k, y: planMid - y * k })) ?? linesOf(v.plan, 'plan', (x, y) => ({ x: fx + x * k, y: planMid - y * k }), spec)),
    ...linesOf(v.section, 'section', (x, y) => ({ x: sectionMid + x * k, y: base - y * k }), spec),
    // What the user drew on the type's views goes over them.
    ...draftsOf(spec, 'front', (x, y) => ({ x: fx + x * k, y: base - y * k }), k),
    ...draftsOf(spec, 'plan', (x, y) => ({ x: fx + x * k, y: planMid - y * k }), k),
    ...draftsOf(spec, 'section', (x, y) => ({ x: sectionMid + x * k, y: base - y * k }), k),
  ];
  // The opening symbol stays on the real front view: the model has the frame, not the hinge side.
  if (spec) {
    for (const p of normalisedPanels(spec)) {
      for (const s of openingMarks(p.operation, panelRect(spec, p), false, convention)) {
        out.push({ kind: 'path', pts: s.pts.map((q) => ({ x: fx + q.x * k, y: base - q.y * k })), closed: s.closed, w: PEN.thin, dashed: s.dashed, view: 'symbol' });
      }
    }
  }
  return out;
}
