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
  // A page the user moved that goes (the schedule needs fewer pages for a moment, or for good) leaves its position on the first sheet's
  // viewport, and gets it back when the page does: a re-layout never takes a moved page's place from it.
  const home0 = (first.viewports ?? []).find((v) => v.viewId === docId);
  const left = holders.slice(pages).flatMap((s) => { const v = (s.viewports ?? []).find((o) => o.viewId === docId); return v?.placed ? [{ page: v.page ?? 0, x: v.x, y: v.y }] : []; });
  const remembered = new Map([...(home0?.placedPages ?? []), ...left].map((e) => [e.page, e] as const));
  const added: ProjectSheet[] = [];
  for (let page = keep.length; page < pages; page++) {
    let n = page;
    while (taken.has(`${first.number}.${n}`)) n++;
    const number = `${first.number}.${n}`;
    taken.add(number);
    const vp = (first.viewports ?? []).find((v) => v.viewId === docId);
    const restored = remembered.get(page);
    remembered.delete(page);
    added.push({
      id: freshProjectId('sheet'), number, series: first.series ?? 'general', name: first.name, createdAt: Date.now(), paper: first.paper, orientation: first.orientation,
      ...(first.frame ? { frame: first.frame } : {}),
      viewports: [{ ...(({ placedPages: _m, ...rest }) => rest)(vp ?? { x: 0, y: 0, scale: 1, width: 0, height: 0, center: null, placedPages: undefined }), id: freshProjectId('viewport'), viewId: docId, page, ...(restored ? { x: restored.x, y: restored.y, placed: true } : {}) }],
    });
  }
  // A continuation sheet removed by hand leaves a gap: the ones kept show pages 0, 1, 2… in order.
  // Every page is fitted to the first sheet's paper: a continuation sheet takes that paper too, so its page stays on it.
  const renumbered = new Map(keep.flatMap((s, i) => (pageOf(s) === i && (i === 0 || (paperLabel(s.paper ?? SET_PAPER) === paperLabel(first.paper ?? SET_PAPER) && s.orientation === first.orientation)) ? [] : [[s.id, {
    ...s, ...(i === 0 ? {} : { paper: first.paper, orientation: first.orientation }),
    viewports: (s.viewports ?? []).map((vp) => (vp.viewId !== docId ? vp : i === 0 ? (({ page: _p, placed: _m, ...rest }) => rest)(vp) : { ...vp, page: i })),
  }] as const])));
  const kept = [...remembered.values()].sort((a, b) => a.page - b.page);
  const same = kept.length === (home0?.placedPages ?? []).length && kept.every((e, i) => { const o = home0?.placedPages?.[i]; return o?.page === e.page && o.x === e.x && o.y === e.y; });
  if (added.length === 0 && gone.size === 0 && renumbered.size === 0 && same) return null;
  // The first sheet's viewport carries the positions of the pages that are away.
  const withMemory = (s: ProjectSheet): ProjectSheet => {
    if (same || s.id !== first.id) return s;
    return { ...s, viewports: (s.viewports ?? []).map((v) => { if (v.viewId !== docId) return v; const { placedPages: _o, ...rest } = v; return kept.length ? { ...rest, placedPages: kept } : rest; }) };
  };
  return [...sheets.filter((s) => !gone.has(s.id)).map((s) => withMemory(renumbered.get(s.id) ?? s)), ...added];
}
