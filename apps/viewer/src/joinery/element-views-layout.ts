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
import { joineryViewLineId, joineryViewLines } from '@bimvoice/ifcsheet/project';
import type { SchedulePrim } from './schedule-layout';

type ViewName = 'front' | 'plan' | 'section';

const PEN = { cut: 0.35, outline: 0.25, thin: 0.13 } as const;

const penOf = (l: ViewLine) => (l.kind === 'cut' ? PEN.cut : l.kind === 'seen' ? PEN.outline : PEN.thin);

/** Paper millimetres a card needs beside the front view for the section. */
export const sectionRoom = (v: ElementViews, k: number): number => v.depth * k + 8;
/** Paper millimetres a card needs under the front view's dimension line for the plan. */
export const planRoom = (v: ElementViews, k: number): number => v.depth * k + 10;

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
  const planMid = base + 10 + (v.depth * k) / 2;
  const sectionMid = fx + (v.width * k) / 2 + 8 + (v.depth * k) / 2;
  const out: SchedulePrim[] = [
    ...linesOf(v.front, 'front', (x, y) => ({ x: fx + x * k, y: base - y * k }), spec),
    ...linesOf(v.plan, 'plan', (x, y) => ({ x: fx + x * k, y: planMid - y * k }), spec),
    ...linesOf(v.section, 'section', (x, y) => ({ x: sectionMid + x * k, y: base - y * k }), spec),
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
