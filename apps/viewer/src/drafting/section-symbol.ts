/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The symbol a section line leaves on its plan: the cut line, a view arrow at
 * each end pointing at the side the section looks toward, and the section's
 * name beside each stem. Plain drafted shapes, so the symbol prints, selects,
 * moves and undoes like any other drawing.
 */

import { registeredTranslations, resolve } from '@/i18n/registry';
import type { AnnotationShape, DraftEntity, DraftParamValue, DraftShape, Pt } from './types';
import { nextAxisLabel, textBox } from './annotation';
import { DETAIL_LINK, detailLink, isDetailMark, PART } from './detail-mark';

/** Stem length in text heights. */
const STEM = 4;
/** Arrowhead barb length (text heights) and its half-angle off the stem. */
const BARB = 0.8;
const BARB_HALF_ANGLE = Math.PI / 7;

/** The unit normal of the cut line a-b on the side `side` is on (the way the section looks); `null` for a line of no length. */
export function sectionNormal(a: Pt, b: Pt, side: Pt): Pt | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const n = { x: -dy / len, y: dx / len };
  return (side.x - a.x) * n.x + (side.y - a.y) * n.y < 0 ? { x: -n.x, y: -n.y } : n;
}

export function sectionSymbolShapes(a: Pt, b: Pt, side: Pt, name: string, height: number): (DraftShape | AnnotationShape)[] {
  const normal = sectionNormal(a, b, side);
  if (!normal) return [];
  const { x: nx, y: ny } = normal;
  const stem = STEM * height;
  const tip = (p: Pt): Pt => ({ x: p.x + nx * stem, y: p.y + ny * stem });
  // The name sits clear of the arrowhead, its box centred on the stem's line: a text's anchor is a corner of its box.
  const box = textBox({ x: 0, y: 0 }, name, height, 0);
  const halfW = box[1].x / 2;
  const halfH = box[3].y / 2;
  const clear = Math.abs(nx) * Math.abs(halfW) + Math.abs(ny) * Math.abs(halfH) + height * 0.4;
  const label = (p: Pt): AnnotationShape => {
    const t = tip(p);
    return { type: 'text', p: { x: t.x + nx * clear - halfW, y: t.y + ny * clear - halfH }, text: name, height, rotation: 0 };
  };
  // Two barbs sweeping back from the tip toward the cut line close the stem into an arrow.
  const barbs = (p: Pt): DraftShape[] => {
    const t = tip(p);
    const r = BARB * height;
    const c = Math.cos(BARB_HALF_ANGLE);
    const s = Math.sin(BARB_HALF_ANGLE);
    // The stem direction reversed (-n), turned by +/- the half angle.
    return [1, -1].map((k) => ({
      type: 'line' as const,
      a: t,
      b: { x: t.x + r * (-nx * c - k * -ny * s), y: t.y + r * (-ny * c + k * -nx * s) },
    }));
  };
  return [
    { type: 'line', a, b },
    { type: 'line', a, b: tip(a) },
    { type: 'line', a: b, b: tip(b) },
    ...barbs(a),
    ...barbs(b),
    label(a),
    label(b),
  ];
}

/** The parameter that ties a drafted shape to the section view whose symbol it belongs to. */
const LINK = 'sectionOf';

/** `Section A-A`: how drawings name a section view. */
export function sectionViewName(mark: string): string {
  return resolve('names.view.section', { mark });
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The words before `{mark}` in `names.view.section` in every registered language (`Section`, `Secțiunea`, …). */
function sectionPrefixes(): string[] {
  const prefixes = registeredTranslations('names.view.section').map((template) => template.split('{mark}')[0].trim());
  return [...new Set(prefixes.filter((p) => p.length > 0))];
}

/** The mark a view name shows on the symbol: `Section A-A` (or the same name in any registered language) → `A`; any other name is shown whole. */
export function sectionMarkOf(name: string): string {
  const prefix = sectionPrefixes().map(escapeRegExp).join('|');
  const m = new RegExp(`^(?:(?:${prefix})\\s+)?(.+?)\\s*-\\s*\\1$`).exec(name.trim());
  return m ? m[1] : name;
}

/** The first mark (A, B, … Z, AA …) no section view uses yet. */
export function nextSectionMark(views: readonly { kind: string; name: string }[]): string {
  const taken = new Set(views.filter((v) => v.kind === 'section').map((v) => sectionMarkOf(v.name).toLowerCase()));
  let mark = 'A';
  while (taken.has(mark.toLowerCase())) mark = nextAxisLabel(mark);
  return mark;
}

export const sectionLink = (e: Pick<DraftEntity, 'params'>): string | null => {
  const id = e.params[LINK];
  return typeof id === 'string' ? id : null;
};

/** A shape of the symbol of a section view that still exists. Such shapes are locked to their section. */
export function isSectionSymbol(e: Pick<DraftEntity, 'params'>, views: readonly { id: string }[]): boolean {
  const id = sectionLink(e);
  return id !== null && views.some((v) => v.id === id);
}

/**
 * A shape locked to a view it belongs to: a section's symbol, or a detail's
 * mark. Such shapes cannot be moved, reshaped or edited (a detail's mark has
 * grips that change the detail's area instead).
 */
export function isLockedToView(e: Pick<DraftEntity, 'params'>, views: readonly { id: string }[]): boolean {
  return isSectionSymbol(e, views) || isDetailMark(e, views);
}

/** `ids` plus every other part of any section symbol they touch: the parts act as one thing. */
export function withSectionParts(ids: ReadonlySet<string>, entities: readonly DraftEntity[]): Set<string> {
  const sections = new Set<string>();
  for (const e of entities) {
    const link = sectionLink(e) ?? detailLink(e);
    if (link && ids.has(e.id)) sections.add(link);
  }
  const out = new Set(ids);
  for (const e of entities) {
    const link = sectionLink(e) ?? detailLink(e);
    if (link && sections.has(link)) out.add(e.id);
  }
  return out;
}

/** The parameters of a copy: the same, minus the claim to be a section's symbol or a detail's mark. */
export function withoutSectionLink(params: Readonly<Record<string, DraftParamValue>>): Record<string, DraftParamValue> {
  const rest = { ...params };
  delete rest[LINK];
  delete rest[DETAIL_LINK];
  delete rest[PART];
  return rest;
}

/** The drafts with the symbol of `viewId` showing the mark of `name`. Unchanged (same array) when nothing shows it. */
export function relabelSectionSymbol(drafts: DraftEntity[], viewId: string, name: string): DraftEntity[] {
  const mark = sectionMarkOf(name);
  if (!drafts.some((d) => d.shape.type === 'text' && sectionLink(d) === viewId && d.shape.text !== mark)) return drafts;
  return drafts.map((d) => (d.shape.type === 'text' && sectionLink(d) === viewId ? { ...d, shape: { ...d.shape, text: mark } } : d));
}
