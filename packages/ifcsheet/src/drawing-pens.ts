/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view's faces and lines grouped by pen (#34): every item styled by the view's one styler (`view-style.ts`), the items that
 * share a pen in one group, so a sheet stays a handful of paths. The web app's sheets (`viewport-pens.ts`, hence their PDF and
 * DXF and the view's DXF) and the headless sheets (`sheet-graphic.ts`) both group through here, so they cannot pen an item
 * differently.
 */

import type { ItemStyle, StyleItem, ViewStyler } from './view-style.js';

/** The layer a pen goes on: a colour scheme's fill, a cut face's fill, the hidden, seen and cut lines, a plan's door and window symbols, a material's hatch and its membrane lines (#645). */
export type PenLayer = 'COLOUR' | 'FILL' | 'HIDDEN' | 'SEEN' | 'CUT' | 'SYMBOLS' | 'HATCH' | 'MEMBRANE';

export interface PenGroup<F, L> {
  key: string;
  layer: PenLayer;
  /** Null: a fill. */
  stroke: string | null;
  /** Paper mm (0 for a fill). */
  width: number;
  fill: string | null;
  /** SVG dash text, paper mm (`1.5 1`); absent: solid. */
  dash?: string;
  faces: F[];
  lines: L[];
}

/**
 * The pens of `faces` (filled in the order given, a colour scheme's rooms first) and `lines`, in first-use order. An item the
 * view does not show is left out. `split`, when given, keeps lines of different subjects apart (the CAD layer standard splits a
 * pen per element class and material); it adds to the key only.
 */
export function penGroups<F extends StyleItem, L extends StyleItem>(
  faces: Iterable<F>, lines: Iterable<L>, styler: ViewStyler, split?: (line: L) => string,
): PenGroup<F, L>[] {
  const groups = new Map<string, PenGroup<F, L>>();
  const at = (key: string, make: () => Omit<PenGroup<F, L>, 'key' | 'faces' | 'lines'>): PenGroup<F, L> => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, ...make(), faces: [], lines: [] }));
    return g;
  };
  for (const face of faces) {
    const s = styler.face(face);
    if (!s.visible || s.fill === null) continue;
    const fill = s.fill;
    at(s.scheme ? `scheme:${fill}` : `fill:${fill}`, () => ({ layer: s.scheme ? 'COLOUR' : 'FILL', stroke: null, width: 0, fill })).faces.push(face);
  }
  for (const line of lines) {
    const s: ItemStyle = styler.line(line);
    if (!s.visible) continue;
    const who = split ? split(line) : '';
    const dash = s.dash.length ? s.dash.join(' ') : undefined;
    const key = s.kind === 'hidden' ? `hidden:${s.stroke}${who}` : `${s.kind === 'cut' ? 'cut' : 'seen'}:${s.stroke}:${s.weight}:${dash ?? ''}${who}`;
    const layer: PenLayer = s.kind === 'hidden' ? 'HIDDEN' : s.kind === 'cut' ? 'CUT' : 'SEEN';
    at(key, () => ({ layer, stroke: s.stroke, width: s.weight, fill: null, ...(dash ? { dash } : {}) })).lines.push(line);
  }
  return [...groups.values()];
}

/** Paint order of a sheet's pens: fills, then hidden lines, then lines thinner than the cut pen, then the rest. */
export function penOrder(p: { fill: string | null; layer: string; width: number }, cutPen: number): number {
  return p.fill ? 0 : p.layer === 'HATCH' ? 1 : p.layer === 'HIDDEN' ? 2 : p.width < cutPen ? 3 : 4;
}
