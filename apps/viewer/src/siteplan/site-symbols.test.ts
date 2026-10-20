/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #135 review: the site plan's north arrow was drawn on top of the east
 * setback dimension. Its own arrow and scale bar now go to a free spot.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pt } from '@/drafting/types';
import { hits, type Box } from './free-spot';
import { setbacks, type Setback } from './plot';
import { siteObstacles, siteSymbolPlaces, SITE_SYMBOL_MARGIN_MM, type SiteSymbolInput } from './site-symbols';

// Paper millimetres throughout (the drawing → paper map is the identity here).
const plot: Pt[] = [{ x: 10, y: 10 }, { x: 290, y: 10 }, { x: 290, y: 190 }, { x: 10, y: 190 }];
const footprint: Pt[][] = [[{ x: 90, y: 60 }, { x: 230, y: 60 }, { x: 230, y: 150 }, { x: 90, y: 150 }]];
const base: SiteSymbolInput = {
  viewport: { x0: 0, y0: 0, x1: 300, y1: 200 }, scale: 200, toPaper: (p) => p,
  boundary: plot, footprint, setbacks: setbacks(footprint, plot), setbackText: (v) => v.toFixed(2), labels: [],
};
const inside = (b: Box, v: Box) => b.x0 >= v.x0 && b.y0 >= v.y0 && b.x1 <= v.x1 && b.y1 <= v.y1;
const clear = (input: SiteSymbolInput, box: Box) => !siteObstacles(input).some((o) => hits(box, o, SITE_SYMBOL_MARGIN_MM));

describe('site plan north arrow and scale bar in a free spot (#48, #135 review)', () => {
  it('moves the arrow off a setback dimension drawn through where it would go', () => {
    const before = siteSymbolPlaces(base).arrowBox;
    assert.ok(clear(base, before), 'the arrow starts clear');
    // The east setback measured at the height of the arrow's spot: its line and its value run through the arrow.
    const y = (before.y0 + before.y1) / 2;
    const through: Setback = { edge: 1, from: { x: 230, y }, to: { x: 290, y }, distance: 60 };
    const crowded = { ...base, footprint: [[{ x: 90, y: y - 1 }, { x: 230, y: y - 1 }, { x: 230, y: 150 }, { x: 90, y: 150 }]], setbacks: [through] };
    assert.ok(!clear(crowded, before), 'the old spot is now taken');
    const { arrowBox, barBox } = siteSymbolPlaces(crowded);
    assert.ok(clear(crowded, arrowBox), `arrow ${JSON.stringify(arrowBox)} touches nothing`);
    assert.ok(clear(crowded, barBox) && !hits(barBox, { kind: 'box', box: arrowBox }, SITE_SYMBOL_MARGIN_MM), 'the bar touches nothing, the arrow neither');
    assert.ok(inside(arrowBox, base.viewport) && inside(barBox, base.viewport));
  });

  it('keeps clear of coordinate labels', () => {
    const before = siteSymbolPlaces(base).arrowBox;
    const labels = [{ x0: before.x0 + 2, y0: before.y0 + 2, x1: before.x0 + 30, y1: before.y0 + 9 }];
    const { arrowBox } = siteSymbolPlaces({ ...base, labels });
    assert.ok(clear({ ...base, labels }, arrowBox));
  });

  it('goes beside the viewport when nothing inside is free', () => {
    const full = { ...base, footprint: [[{ x: 1, y: 1 }, { x: 299, y: 1 }, { x: 299, y: 199 }, { x: 1, y: 199 }]] };
    const { arrowBox } = siteSymbolPlaces(full);
    assert.ok(arrowBox.x0 >= 300);
  });
});
