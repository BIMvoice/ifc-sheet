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
 * #557: a view's title moves down under the label of an elevation or section mark that stands under the drawing, by the rule the engine's
 * PDF uses (`viewTitleLayout`). The engine side is pinned on the sample building in `packages/ifcsheet/src/title-clear.test.ts`.
 */

afterEach(() => cleanup());

const sheet: ProjectSheet = { id: 's', number: 'A-901', name: 'Plans', createdAt: 0, viewports: [{ id: 'v', viewId: 'none', center: null, x: 100, y: 100, width: 120, height: 80, scale: 100 }] };
const titleOf = (markBoxes: readonly { min: { x: number; y: number }; max: { x: number; y: number } }[]): number => {
  const ui = render(
    <SheetPaper sheet={sheet} projectName="House" content={() => ({ view: undefined, drawing: null, drafts: [], drawingNumber: 'A-12', markBoxes })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
  );
  const title = [...ui.querySelectorAll('text[data-dxf-layer="VIEWPORT-LABELS"]')].find((t) => t.textContent?.includes('?'));
  assert.ok(title, 'the title is printed');
  const y = Number(title.getAttribute('y'));
  cleanup();
  return y;
};

describe('the view title on the sheet, with a mark under the drawing', () => {
  // 1:100 puts the drawing's metres at 10 mm each about the viewport's centre (100, 100): this box is x 50..70, y 142..145 mm.
  const mark = { min: { x: -5, y: 4.2 }, max: { x: -3, y: 4.5 } };

  it('stays where viewTitleLayout puts it with no marks', () => {
    assert.equal(titleOf([]), viewTitleLayout({ x: 40, y: 60, w: 120, h: 80 }, 3.5, 'A-12').baseline);
  });

  it('moves down under the mark, as viewTitleLayout does for the same box', () => {
    const marked = { x0: 50, x1: 70, y0: 142, y1: 145 };
    const expected = viewTitleLayout({ x: 40, y: 60, w: 120, h: 80 }, 3.5, 'A-12', { text: '? 1:100', marks: [marked] }).baseline;
    const y = titleOf([mark]);
    assert.ok(y - 3.5 >= 145 + 1 - 1e-9, `the title's top (${y - 3.5}) is under the mark's bottom (145)`);
    assert.ok(Math.abs(y - expected) < 0.01, `${y} is ${expected}`);
  });
});
