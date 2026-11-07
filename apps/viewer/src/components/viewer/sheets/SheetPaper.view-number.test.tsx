/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import type { ProjectSheet } from '@/project/types';
import { viewTitleLayout } from '@bimvoice/ifcsheet';
import { SheetPaper } from './SheetPaper';

/**
 * #162: the ring round a drawing's number is placed by the function the engine's PDF and DXF use (`viewTitleLayout`), so the app's sheet
 * and `ifcsheet build` put the same ring at the same place. The engine side is pinned on the FZK-Haus set in
 * `packages/ifcsheet/src/view-title.fzk.test.ts`.
 */

afterEach(() => cleanup());

describe('the ring of a drawing number on the sheet', () => {
  it('is where viewTitleLayout puts it, with the number in it and the title after it', () => {
    const sheet: ProjectSheet = { id: 's', number: 'A-901', name: 'Plans', createdAt: 0, viewports: [{ id: 'v', viewId: 'none', center: undefined, x: 100, y: 100, width: 120, height: 80, scale: 100 }] };
    const ui = render(
      <SheetPaper sheet={sheet} projectName="House" content={() => ({ view: undefined, drawing: null, drafts: [], drawingNumber: 'A-12' })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
    );
    const label = ui.querySelector('g[data-dxf-layer="VIEWPORT-LABELS"]');
    assert.ok(label, 'the ring is on the VIEWPORT-LABELS layer');
    const rect = label.querySelector('rect');
    assert.ok(rect);
    const expected = viewTitleLayout({ x: 40, y: 60, w: 120, h: 80 }, 3.5, 'A-12');
    assert.ok(expected.number);
    const ring = expected.number.ring;
    assert.deepEqual([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height'), rect.getAttribute('rx')].map(Number), [ring.x, ring.y, ring.w, ring.h, ring.r]);
    const number = label.querySelector('text');
    assert.equal(number?.textContent, 'A-12');
    assert.equal(Number(number?.getAttribute('x')), expected.number.at.x);
    assert.equal(Number(number?.getAttribute('y')), expected.number.at.y);
    const title = [...ui.querySelectorAll('text[data-dxf-layer="VIEWPORT-LABELS"]')].find((t) => t.textContent?.includes('?'));
    assert.equal(Number(title?.getAttribute('x')), expected.textX);
    assert.equal(Number(title?.getAttribute('y')), expected.baseline);
  });
});
