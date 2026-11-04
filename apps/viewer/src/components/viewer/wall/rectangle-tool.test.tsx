/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { attachDraftingView, clickDrawing, startDraftCommand } from '@/drafting/session';
import { draftsOfView } from '@/drafting/draft-store';
import { resetProject } from '@/project/project-store';
import { ToolRail } from './ToolRail.js';

/** #672: Lloyd found no Rectangle among the draw tools, though the RECTANGLE command existed. */

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('the Rectangle tool on the rail (#672)', () => {
  it('is among the draw tools, names its key, and starts the rectangle command', () => {
    const started: string[] = [];
    const ui = render(<ToolRail active={null} onTool={(c) => started.push(c)} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} />);
    const button = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Rectangle');
    assert.ok(button, 'a Rectangle button is on the rail');
    assert.ok(button.getAttribute('title')?.includes('Click two opposite corners'), 'the help line is its tooltip');
    assert.ok(button.getAttribute('aria-keyshortcuts'), 'it announces its key');
    click(button);
    assert.deepEqual(started, ['rectangle']);
  });

  it('draws one closed four-cornered shape, the zone a fill needs', () => {
    const viewId = 'view-672';
    act(() => {
      attachDraftingView(viewId, 'down', () => []);
      startDraftCommand('rectangle');
    });
    act(() => {
      clickDrawing({ x: 1, y: 1 }, 0.05, false);
      clickDrawing({ x: 4, y: 3 }, 0.05, false);
    });
    const shapes = draftsOfView(viewId).map((d) => d.shape);
    assert.equal(shapes.length, 1);
    const shape = shapes[0];
    assert.equal(shape.type, 'polyline');
    if (shape.type !== 'polyline') return;
    assert.equal(shape.closed, true);
    assert.equal(shape.pts.length, 4);
  });
});
