/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #135 review: a building over the plot line is drawn as an encroachment, not as an ordinary setback. */

import '@/test/setup-dom.js';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { render, cleanup } from '@/test/render.js';
import { setbacks, PLOT_BOUNDARY_LAYER } from '@/siteplan/plot';
import { SiteOverlay } from './SiteGraphics';

afterEach(cleanup);

describe('site plan setbacks on the sheet (#135 review)', () => {
  it('flags and colours the side the building is over, and only that side', () => {
    // Footprint 20 × 12 m standing 3 m over the west line (x = 0) of a 42 × 29 m plot.
    const footprint = [[{ x: -3, y: 5 }, { x: 17, y: 5 }, { x: 17, y: 17 }, { x: -3, y: 17 }]];
    const boundary = [{ x: 0, y: -4 }, { x: 42, y: -4 }, { x: 42, y: 25 }, { x: 0, y: 25 }];
    const site = { boundary, footprint, setbacks: setbacks(footprint, boundary), plotArea: null, footprintArea: null };
    const ui = render(<svg><SiteOverlay site={site} transform={{ scale: 5, x: 100, y: 100 }} axis="down" scale={200} /></svg>);
    const flagged = [...ui.querySelectorAll('[data-encroachment="true"]')];
    assert.deepEqual(flagged.map((g) => g.getAttribute('data-setback')), ['-3.000']);
    assert.equal(flagged[0].getAttribute('data-dxf-color'), PLOT_BOUNDARY_LAYER.color);
    assert.equal(ui.querySelectorAll('[data-setback]').length, 4);
  });
});
