/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Finding a sheet on the Wall: by its number, its name, or the name of a drawing
 * placed on it. Case and accents do not matter, so "sectiune" finds "Secțiune".
 */

import type { ProjectSheet } from '@/project/types';

/** Lower-case, accent-free form of `text`, for comparing. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export type FoundVia = 'number' | 'name' | 'view';

export interface SheetHit {
  sheetId: string;
  via: FoundVia;
  /** The drawing's name when found by it. */
  viewName?: string;
}

const RANK: Record<FoundVia, number> = { number: 0, name: 1, view: 2 };

/**
 * The sheets matching `query`, best first (number, then name, then a drawing's
 * name; the Wall's order within each). Every word of the query must be found
 * in the sheet's number, name or one drawing's name; a sheet is reported by
 * the first of those that holds all the words alone, else by the number, name
 * and drawings read together.
 */
export function findSheets(query: string, sheets: readonly ProjectSheet[], viewName: (viewId: string) => string | undefined): SheetHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const holds = (text: string) => words.every((w) => text.includes(w));
  const hits: (SheetHit & { order: number })[] = [];
  sheets.forEach((sheet, order) => {
    const number = fold(sheet.number);
    const name = fold(sheet.name);
    const placed = (sheet.viewports ?? []).map((vp) => viewName(vp.viewId)).filter((n): n is string => !!n);
    const alone = holds(number) ? { via: 'number' as const } : holds(name) ? { via: 'name' as const } : null;
    if (alone) {
      hits.push({ sheetId: sheet.id, order, ...alone });
      return;
    }
    const view = placed.find((n) => holds(fold(n)));
    if (view !== undefined) {
      hits.push({ sheetId: sheet.id, order, via: 'view', viewName: view });
      return;
    }
    const together = fold([sheet.number, sheet.name, ...placed].join(' '));
    if (holds(together)) hits.push({ sheetId: sheet.id, order, via: 'name' });
  });
  return hits.sort((a, b) => RANK[a.via] - RANK[b.via] || a.order - b.order).map(({ order: _order, ...hit }) => hit);
}
