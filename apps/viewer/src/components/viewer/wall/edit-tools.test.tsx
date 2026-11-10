/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject } from '@/project/project-store';
import { resolveEnglish as t } from '@/i18n/registry';
import { NO_ARRANGE, steppedHandlers, type SteppedActions } from './stepped-keys.js';
import { ToolRail } from './ToolRail.js';

/** #189: TRIM, EXTEND, FILLET, OFFSET, CHAMFER and HIDELINE are buttons on the rail, each with its key, and start their command. */

beforeEach(() => resetProject());
afterEach(() => cleanup());

const TOOLS = [
  ['trim', 'Trim', 'wall.draw.trim'],
  ['extend', 'Extend', 'wall.draw.extend'],
  ['fillet', 'Fillet', 'wall.draw.fillet'],
  ['offset', 'Offset', 'wall.draw.offset'],
  ['chamfer', 'Chamfer', 'wall.draw.chamfer'],
  ['hideline', 'Hide line', 'wall.draw.hideline'],
] as const;

describe('the edit tools on the rail (#189)', () => {
  it('each is a button with its help line and its key, and starts its command', () => {
    const started: string[] = [];
    const ui = render(<ToolRail active={null} onTool={(c) => started.push(c)} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} />);
    for (const [, label, helpKey] of TOOLS) {
      const button = [...ui.querySelectorAll('button')].find((b) => b.textContent === label);
      assert.ok(button, `${label} is on the rail`);
      assert.ok(button.getAttribute('title')?.includes(t(`${helpKey}.body` as Parameters<typeof t>[0])), `${label}: the help line is its tooltip`);
      assert.match(button.getAttribute('aria-keyshortcuts') ?? '', /Alt\+/, `${label} announces its key`);
      assert.ok(button.getAttribute('title')?.includes('Alt'), `${label} names its key in the title`);
      click(button);
    }
    assert.deepEqual(started, TOOLS.map(([c]) => c));
  });

  it('the edit tools sit in their own labelled section, after Draw and not in it', () => {
    const ui = render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} />);
    const heading = (name: string) => [...ui.querySelectorAll('p')].find((p) => p.textContent === name);
    const edit = heading('Edit');
    const draw = heading('Draw');
    assert.ok(edit && draw, 'both section labels are on the rail');
    const grids = (h: Element) => h.nextElementSibling;
    const names = (el: Element | null | undefined) => [...(el?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
    assert.deepEqual(names(grids(edit)), ['Trim', 'Extend', 'Fillet', 'Offset', 'Chamfer', 'Hide line']);
    for (const label of ['Trim', 'Extend', 'Fillet', 'Offset', 'Chamfer', 'Hide line']) assert.ok(!names(grids(draw)).includes(label), `${label} is not under Draw`);
  });

  it('their keys start the same commands', () => {
    const started: string[] = [];
    const actions: SteppedActions = {
      startTool: (c) => { started.push(c); }, toggleAdd: () => {}, fit: null, print: null, previous: null, next: null, back: () => {}, leaveEdit: null,
      comment: null, paper: null, titleBlock: null, revisions: null, printPreview: null, exportDxf: null, arrange: NO_ARRANGE,
    };
    const handlers = steppedHandlers(actions);
    for (const [, , id] of TOOLS) handlers[id]?.();
    assert.deepEqual(started, TOOLS.map(([c]) => c));
  });
});
