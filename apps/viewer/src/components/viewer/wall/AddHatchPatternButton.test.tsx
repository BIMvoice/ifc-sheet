/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #671: "Add a hatch pattern" sits next to the hatch choice (the materials card and the hatch card), loads a .pat file
 * into the project and picks the new pattern at once. The file chooser is stood in for by the input the button creates.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { parsePat } from '@/drafting/hatch/pattern';
import { resetProject, useProjectStore } from '@/project/project-store';
import { materialGraphics } from '@/project/materials';
import { MaterialRow } from './MaterialRow';

const PAT = '*DIAMONDS, Test diamonds\n45, 0,0, 0,5\n135, 0,0, 0,5\n';

/** Click the button and answer the file chooser it opens with `text`. */
async function chooseFile(ui: HTMLElement, text: string): Promise<void> {
  const inputs: HTMLInputElement[] = [];
  const spy = mock.method(window.HTMLInputElement.prototype, 'click', function (this: HTMLInputElement) { inputs.push(this); });
  click(ui.querySelector('[data-add-hatch-pattern]')!);
  spy.mock.restore();
  const input = inputs[0];
  assert.ok(input, 'the button opened a file chooser');
  assert.equal(input.accept.includes('.pat'), true);
  Object.defineProperty(input, 'files', { value: [{ name: 'd.pat', text: async () => text }] });
  await act(async () => { await (input.onchange as () => Promise<void>)(); });
}

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(cleanup);

describe('Add a hatch pattern beside the material hatch choice', () => {
  it('is visible, loads the .pat into the project and picks its first pattern for the material', async () => {
    const material = materialGraphics('Brick', []);
    const ui = render(<ul><MaterialRow material={material} patterns={[]} hatchNames={['BRICK']} /></ul>);
    const button = ui.querySelector('[data-add-hatch-pattern]');
    assert.ok(button, 'the button is on the card');
    assert.equal(button.textContent, 'Add a hatch pattern');
    await chooseFile(ui, PAT);
    const saved = parsePat(useProjectStore.getState().hatchPatterns ?? '').patterns;
    assert.deepEqual(saved.map((p) => p.name), ['DIAMONDS']);
    assert.equal(useProjectStore.getState().materials?.find((m) => m.name === 'Brick')?.hatch, 'DIAMONDS');
  });

  it('keeps the choice and says so when the file holds no pattern', async () => {
    const ui = render(<ul><MaterialRow material={materialGraphics('Brick', [])} patterns={[]} hatchNames={['BRICK']} /></ul>);
    await chooseFile(ui, 'nothing here');
    assert.equal(useProjectStore.getState().hatchPatterns ?? '', '');
    assert.equal(useProjectStore.getState().materials?.find((m) => m.name === 'Brick'), undefined);
  });
});
