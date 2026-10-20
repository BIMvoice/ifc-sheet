/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { ToolRail } from './ToolRail.js';

/**
 * The one-action twins under the tools: the whole plan dimensioned and every
 * door, window and room tagged are offered on a plan; every level marked on a
 * section or an elevation. Each runs the command of the same name.
 */

afterEach(() => cleanup());

const offers = (ui: HTMLElement) => [...ui.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => /whole plan|everything|all levels/.test(t));

describe('ToolRail', () => {
  it('offers the whole plan dimensioned and everything tagged on a plan, and no level marks', () => {
    const ui = render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} />);
    assert.deepEqual(offers(ui), ['Dimension the whole plan', 'Tag everything']);
  });

  it('offers every level marked on a section and on an elevation, and nothing else', () => {
    for (const kind of ['section', 'elevation'] as const) {
      const ui = render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind={kind} onAll={() => {}} />);
      assert.deepEqual(offers(ui), ['Mark all levels'], kind);
      cleanup();
    }
  });

  it('offers none with no drawing to work on, and runs the command of the one clicked', () => {
    const none = render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind={null} onAll={() => {}} />);
    assert.deepEqual(offers(none), []);
    cleanup();
    const ran: string[] = [];
    const ui = render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind="plan" onAll={(c) => ran.push(c)} />);
    for (const b of [...ui.querySelectorAll('button')].filter((x) => /whole plan|everything/.test(x.textContent ?? ''))) click(b);
    assert.deepEqual(ran, ['dimall', 'tagall']);
  });
});
