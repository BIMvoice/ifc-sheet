/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '@/i18n/registry';
import { cleanup, click, render } from '@/test/render.js';
import { InfoCard } from './InfoCard.js';
import { ToolRail } from './ToolRail.js';
import { toolHelpKey } from './tool-help.js';
import { WALL_TOOLS } from './wall-actions.js';

/**
 * A help line per tool, from one source: the rail's own tools are walked (the
 * rail is rendered and clicked, no hand list of commands), each has a line,
 * the rail shows it on hover and the card shows it once the tool is chosen.
 */

afterEach(() => cleanup());

describe('tool help', () => {
  it('gives every tool on the rail a help line, shown on the rail and on the card once chosen', () => {
    const chosen: string[] = [];
    const rail = render(<ToolRail active={null} onTool={(c) => chosen.push(c)} adding={false} onAdd={() => {}} viewKind={null} onAll={() => {}} />);
    // The tools are the rail's buttons that have help: every one except "Add a drawing" and the Ortho toggle (a lock, not a tool: it does not call onTool).
    const ortho = resolve('wall.ortho.aria');
    const buttons = [...rail.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].filter((b) => b.hasAttribute('title') && !b.textContent?.includes('Add a drawing') && b.getAttribute('aria-label') !== ortho);
    for (const b of buttons) click(b);
    assert.ok(chosen.length >= WALL_TOOLS.length, 'the rail offers at least the six large tools');
    assert.equal(chosen.filter((c) => WALL_TOOLS.some((w) => w.command === c)).length, 6, 'six large tools');
    assert.equal(new Set(chosen).size, chosen.length, 'each tool once');

    buttons.forEach((b, i) => {
      const line = resolve(toolHelpKey(chosen[i]));
      assert.ok(line.length > 0, `${chosen[i]} has a help line`);
      // The tooltip is the line, then the tool's key from the keymap.
      assert.ok(b.getAttribute('title')?.startsWith(`${line} (`), `${chosen[i]} shows it on the rail: ${b.getAttribute('title')}`);
    });
    cleanup();
    for (const command of chosen) {
      const card = render(<InfoCard tool={command} onDone={() => {}} />);
      assert.ok((card.textContent ?? '').includes(resolve(toolHelpKey(command))), `${command} shows its help line once chosen`);
      cleanup();
    }
  });

  it('refuses a tool that has no help line rather than showing nothing', () => {
    assert.throws(() => toolHelpKey('nonexistent'), /no help line/);
  });
});
