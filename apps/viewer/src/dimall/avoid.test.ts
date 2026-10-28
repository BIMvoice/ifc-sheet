/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What the plan's section symbols give annotation to keep clear of: the cut line apart from the stems and barbs, in time that grows with the drawing, not with its square. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftEntity } from '@/drafting/types';
import { symbolPieces } from './avoid';

const LINK = 'sectionOf';
const line = (id: string, link: string | null, ax: number, ay: number, bx: number, by: number): DraftEntity => ({ id, viewId: 'v', layerId: 'l', shape: { type: 'line', a: { x: ax, y: ay }, b: { x: bx, y: by } }, params: link ? { [LINK]: link } : {} });

describe('symbolPieces', () => {
  it('takes the longest line of each symbol as its cut line, and not a line of another symbol or of none', () => {
    const pieces = symbolPieces([line('a', 's1', 0, 0, 10, 0), line('b', 's1', 0, 0, 1, 0), line('c', 's2', 0, 5, 2, 5), line('d', null, 0, 9, 99, 9)]);
    assert.deepEqual(pieces.map((p) => p.kind), ['cut', 'head', 'cut']);
  });

  it('reads 3 000 section symbols in milliseconds', () => {
    const drafts: DraftEntity[] = [];
    for (let s = 0; s < 3000; s++) for (let k = 0; k < 7; k++) drafts.push(line(`${s}-${k}`, `s${s}`, s, k, s + (k === 0 ? 10 : 1), k));
    const started = performance.now();
    const pieces = symbolPieces(drafts);
    const ms = performance.now() - started;
    console.log(`symbolPieces perf: ${drafts.length} lines in ${Math.round(ms)} ms`);
    assert.equal(pieces.filter((p) => p.kind === 'cut').length, 3000);
    assert.ok(ms < 500, `took ${Math.round(ms)} ms`);
  });
});
