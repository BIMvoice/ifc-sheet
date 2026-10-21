/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ElementView, ElementViews, ViewLine, ViewLineKind } from './element-views';
import { viewPrims } from './element-views-layout';

/**
 * The line work of a card's views: one segment per kind, in order. A hidden edge is dashed and thin, a seen
 * outline is the outline pen, a cut is the heaviest pen, hatch is thin.
 */

const KINDS: ViewLineKind[] = ['cut', 'seen', 'hidden', 'hatch'];
const view = (): ElementView => ({
  lines: KINDS.map((kind, i): ViewLine => ({ a: { x: 0, y: i }, b: { x: 1, y: i }, kind })),
  min: { x: 0, y: 0 }, max: { x: 1, y: 3 },
});
const VIEWS: ElementViews = { width: 1, depth: 0.2, height: 2, front: view(), plan: view(), section: view() };

/** The primitives of one view by the kind of line each came from: a view's lines become primitives in order. */
function primsByKind(name: 'front' | 'plan' | 'section') {
  const prims = viewPrims(VIEWS, null, { fx: 0, base: 0 }, 10, 'handle').filter((p) => p.kind === 'path' && p.view === name);
  assert.equal(prims.length, KINDS.length);
  return new Map(KINDS.map((kind, i) => [kind, prims[i]] as const));
}

describe('the line work of a card\'s views (#147)', () => {
  for (const name of ['front', 'plan', 'section'] as const) {
    it(`${name}: only a hidden edge is dashed`, () => {
      const by = primsByKind(name);
      for (const kind of KINDS) {
        const p = by.get(kind)!;
        assert.equal(p.kind === 'path' && p.dashed === true, kind === 'hidden', `${name} ${kind} dashed`);
      }
    });

    it(`${name}: the cut is the heaviest pen, the seen outline lighter, hidden and hatch the thinnest`, () => {
      const by = primsByKind(name);
      const w = (kind: ViewLineKind): number => { const p = by.get(kind)!; return p.kind === 'path' ? p.w : NaN; };
      assert.equal(w('cut'), 0.35);
      assert.equal(w('seen'), 0.25);
      assert.equal(w('hidden'), 0.13);
      assert.equal(w('hatch'), 0.13);
      assert.ok(w('cut') > w('seen') && w('seen') > w('hidden'), 'cut > seen > hidden');
    });
  }
});
