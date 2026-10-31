/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tag-field configurator in the drawer, over FZK-Haus: it previews on a
 * real door, edits and reorders the sources, saves them in the project, and
 * keeps its keys from a running tool and from an idle command line alike.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useRef } from 'react';
import { cleanup, click, press, render, type } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { attachDraftingView, cancelCommand, clickDrawing, runningCommand, startDraftCommand } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useDraftingKeys } from '../drafting/useDraftingKeys.js';
import { TagFieldsPanel } from './TagFieldsPanel.js';

beforeEach(async () => {
  resetProject();
  seedModel('fzk', 0, await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc'))), 1);
});
afterEach(() => { cancelCommand(); cleanup(); });

function KeysHarness({ submitted }: { submitted: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useDraftingKeys({ inputRef, setText: () => {}, submit: () => { submitted.push('submit'); } });
  return <input ref={inputRef} aria-label="command line" />;
}

const named = (ui: HTMLElement, label: string) => ui.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const button = (ui: HTMLElement, text: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent === text)!;
const preview = (ui: HTMLElement) => ui.querySelector('[data-testid="tag-preview-door-mark"]')?.textContent;

describe('the tag fields panel', () => {
  it('previews the door mark on the first door of the model, and on another when asked', () => {
    const ui = render(<TagFieldsPanel />);
    // The Tag of this door is a unique id, which is no mark: the mark is the one its type has in the schedule (#631), never the name.
    assert.equal(preview(ui), 'The tag reads: D1');
    const picker = ui.querySelector('select')!;
    assert.ok([...picker.options].some((o) => o.textContent === 'Terrassentuer'));
    const other = [...picker.options].find((o) => o.textContent === 'Terrassentuer')!;
    picker.value = other.value;
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.match(preview(ui)!, /^The tag reads: D\d+$/);
  });

  it('adds a property as a source, shows what it reads, and saves it in the project', () => {
    const ui = render(<TagFieldsPanel />);
    type(named(ui, 'Set and name') as HTMLInputElement, 'ArchiCADProperties.Raumnummer');
    click(button(ui, 'Add source'));
    assert.deepEqual(useProjectStore.getState().tagFields, { door: { mark: [{ kind: 'attribute', name: 'Mark' }, { kind: 'pset', pset: 'ArchiCADProperties', property: 'Raumnummer' }] } });
    assert.equal(useProjectStore.getState().dirty, true);
    // The Mark of these doors is the schedule's, so it is taken before the property.
    assert.equal(preview(ui), 'The tag reads: D1');
    // Moved first, it is taken first; removed, the list left is still a choice (it opts the TAG tool in), and
    // only "Back to the default" removes the entry.
    click(named(ui, 'Move ArchiCADProperties.Raumnummer up'));
    assert.equal(useProjectStore.getState().tagFields?.door?.mark?.[0].kind, 'pset');
    click(named(ui, 'Remove ArchiCADProperties.Raumnummer'));
    assert.deepEqual(useProjectStore.getState().tagFields, { door: { mark: [{ kind: 'attribute', name: 'Mark' }] } });
    click(button(ui, 'Back to the default'));
    assert.equal(useProjectStore.getState().tagFields, undefined);
    assert.equal(preview(ui), 'The tag reads: D1');
  });

  it('refuses a source that is not a set and a name', () => {
    const ui = render(<TagFieldsPanel />);
    type(named(ui, 'Set and name') as HTMLInputElement, 'Raumnummer');
    assert.equal(button(ui, 'Add source').disabled, true);
  });

  for (const tool of ['running', 'idle'] as const) {
    it(`keeps its keys from the command line with a tool ${tool}`, () => {
      attachDraftingView('plan-1', 'down', () => []);
      clearDraftHistory();
      if (tool === 'running') {
        startDraftCommand('line');
        clickDrawing({ x: 1, y: 1 }, 0.05, false);
        assert.ok(runningCommand(), 'LINE is waiting for its second point');
      }
      const submitted: string[] = [];
      const ui = render(<><KeysHarness submitted={submitted} /><TagFieldsPanel /></>);
      const input = named(ui, 'Set and name') as HTMLInputElement;
      type(input, 'Office.Nr');
      press(input, 'Enter');
      press(input, ' ');
      assert.deepEqual(submitted, [], 'nothing reached the command line');
      assert.deepEqual(useProjectStore.getState().tagFields?.door?.mark?.at(-1), { kind: 'pset', pset: 'Office', property: 'Nr' }, 'Enter in the field adds the source');
      if (tool === 'idle') {
        press(document.body, 'Enter');
        assert.deepEqual(submitted, ['submit'], 'the same key from outside still confirms: the guard is the panel\'s');
      }
    });
  }
});
