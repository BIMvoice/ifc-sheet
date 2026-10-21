/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A table that runs over several sheets: the drawing register (#126) and the
 * joinery schedules (#186). The document's own sheet shows page 0; each further
 * page is a continuation sheet numbered after it (A-601.1, A-601.2…), holding
 * a viewport of the same document with `page` set. One mechanism, so the two
 * cannot disagree on numbering, paper or removal.
 */

import { registerHolders } from './drawing-register';
import { paperLabel } from './paper';
import { SET_PAPER } from './drawing-set';
import { freshProjectId } from './view-defaults';
import type { ProjectSheet } from './types';

/**
 * `sheets` with the document `docId` over exactly `pages` sheets: continuation
 * sheets added after its own (skipping a number another sheet has), the ones no
 * longer needed removed, the ones kept shown as pages 0, 1, 2… in order and on
 * the first sheet's paper (every page is fitted to it). Null when nothing changes.
 */
export function withContinuationPages(sheets: readonly ProjectSheet[], docId: string, pages: number): ProjectSheet[] | null {
  const pageOf = (s: ProjectSheet) => (s.viewports ?? []).find((vp) => vp.viewId === docId)?.page ?? 0;
  const holders = registerHolders(sheets, docId);
  const first = holders[0];
  if (!first) return null;
  const keep = holders.slice(0, pages);
  const gone = new Set(holders.slice(pages).map((s) => s.id));
  const taken = new Set(sheets.filter((s) => !gone.has(s.id)).map((s) => s.number));
  const added: ProjectSheet[] = [];
  for (let page = keep.length; page < pages; page++) {
    let n = page;
    while (taken.has(`${first.number}.${n}`)) n++;
    const number = `${first.number}.${n}`;
    taken.add(number);
    const vp = (first.viewports ?? []).find((v) => v.viewId === docId);
    added.push({
      id: freshProjectId('sheet'), number, series: first.series ?? 'general', name: first.name, createdAt: Date.now(), paper: first.paper, orientation: first.orientation,
      ...(first.frame ? { frame: first.frame } : {}),
      viewports: [{ ...(vp ?? { x: 0, y: 0, scale: 1, width: 0, height: 0, center: null }), id: freshProjectId('viewport'), viewId: docId, page }],
    });
  }
  // A continuation sheet removed by hand leaves a gap: the ones kept show pages 0, 1, 2… in order.
  // Every page is fitted to the first sheet's paper: a continuation sheet takes that paper too, so its page stays on it.
  const renumbered = new Map(keep.flatMap((s, i) => (pageOf(s) === i && (i === 0 || (paperLabel(s.paper ?? SET_PAPER) === paperLabel(first.paper ?? SET_PAPER) && s.orientation === first.orientation)) ? [] : [[s.id, {
    ...s, ...(i === 0 ? {} : { paper: first.paper, orientation: first.orientation }),
    viewports: (s.viewports ?? []).map((vp) => (vp.viewId !== docId ? vp : i === 0 ? (({ page: _p, ...rest }) => rest)(vp) : { ...vp, page: i })),
  }] as const])));
  if (added.length === 0 && gone.size === 0 && renumbered.size === 0) return null;
  return [...sheets.filter((s) => !gone.has(s.id)).map((s) => renumbered.get(s.id) ?? s), ...added];
}
