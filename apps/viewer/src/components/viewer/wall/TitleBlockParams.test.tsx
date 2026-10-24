/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { ProjectDrawer } from './ProjectDrawer.js';
import { TitleBlockCard } from './TitleBlockForm.js';
import { useWallNav } from './wall-nav.js';

/**
 * #143 in the drawer: the user adds, renames, values and deletes parameters,
 * and edits the title block's layout; a sheet's card gives its own values.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: 'drawer' });
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

const named = (ui: HTMLElement, label: string): HTMLInputElement => {
  const el = ui.querySelector(`[aria-label="${label}"]`);
  assert.ok(el, `a control named ${label}`);
  return el as HTMLInputElement;
};
const button = (ui: HTMLElement, text: string): HTMLButtonElement => {
  const el = [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  assert.ok(el, `a button ${text}`);
  return el;
};
/** The card as the Wall mounts it: the sheet read live from the store. */
function Card() {
  const sheet = useProjectStore((s) => s.sheets[0]);
  return sheet ? <TitleBlockCard sheet={sheet} onClose={() => {}} /> : null;
}
const params = () => useProjectStore.getState().titleBlockParams;

describe('Parameters in the project drawer (#143)', () => {
  it('adds a parameter, renames it, gives it a value and deletes it', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    assert.match(ui.textContent ?? '', /\{SheetNumber\}/, 'the built-in names are listed');
    click(button(ui, 'Add a parameter'));
    assert.deepEqual(params(), [{ name: 'Parameter', value: '' }]);

    type(named(ui, 'Parameter name'), 'Phase');
    blur(named(ui, 'Parameter name'));
    assert.deepEqual(params()?.map((p) => p.name), ['Phase']);

    type(named(ui, 'Value of Phase'), 'DTAC');
    blur(named(ui, 'Value of Phase'));
    assert.deepEqual(params(), [{ name: 'Phase', value: 'DTAC' }]);

    click(named(ui, 'Delete the parameter Phase'));
    assert.deepEqual(params(), []);
  });

  it('says why a name is refused and keeps the old one', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'Add a parameter'));
    type(named(ui, 'Parameter name'), 'SheetNumber');
    blur(named(ui, 'Parameter name'));
    assert.equal(params()?.[0]?.name, 'Parameter');
    assert.match(ui.querySelector('[role="alert"]')?.textContent ?? '', /built in/i);
    assert.equal(named(ui, 'Parameter name').getAttribute('aria-invalid'), 'true');
  });

  it('a second new parameter takes a free name', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'Add a parameter'));
    click(button(ui, 'Add a parameter'));
    assert.deepEqual(params()?.map((p) => p.name), ['Parameter', 'Parameter2']);
  });
});

describe('a sheet\'s own parameter value (#143)', () => {
  it('is typed on its card, marked as its own, and put back to the project\'s', () => {
    useProjectStore.setState({ titleBlockParams: [{ name: 'Phase', value: 'DTAC' }] });
    const ui = render(<Card />);
    const input = [...ui.querySelectorAll('label')].find((l) => l.textContent?.startsWith('{Phase}'))?.querySelector('input');
    assert.ok(input);
    assert.equal(input.value, 'DTAC');
    type(input, 'PAC');
    blur(input);
    assert.deepEqual(useProjectStore.getState().sheets[0]?.titleBlockParams, { Phase: 'PAC' });
    assert.match(ui.textContent ?? '', /this sheet only/);
    click(button(ui, 'As on every sheet'));
    assert.equal(useProjectStore.getState().sheets[0]?.titleBlockParams, undefined);
  });

  it('leaving the value as shown does not copy the project\'s value onto the sheet', () => {
    useProjectStore.setState({ titleBlockParams: [{ name: 'Phase', value: 'DTAC' }] });
    const ui = render(<Card />);
    const input = [...ui.querySelectorAll('label')].find((l) => l.textContent?.startsWith('{Phase}'))?.querySelector('input');
    assert.ok(input);
    blur(input);
    assert.equal(useProjectStore.getState().sheets[0]?.titleBlockParams, undefined);
  });
});

describe('the layout editor (#143)', () => {
  it('starts from the standard layout, edits a line, refuses nonsense, adds a text and resets', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'Edit the layout'));
    const items = () => useProjectStore.getState().titleBlockTemplate?.items ?? [];
    assert.ok(items().length > 20, 'the standard layout is now the project\'s');

    const x2 = named(ui, 'Line 1: x2');
    type(x2, '90');
    blur(x2);
    const first = items().find((i) => i.kind === 'line');
    assert.equal(first && first.kind === 'line' ? first.x2 : null, 90);

    const pen = named(ui, 'Line 1: pen');
    type(pen, '0');
    blur(pen);
    assert.match(ui.querySelector('[role="alert"]')?.textContent ?? '', /Not a usable value/);
    assert.equal(items().find((i) => i.kind === 'line' && i.id === first?.id && i.weight === 0), undefined);

    const before = items().length;
    click(button(ui, 'Add a text'));
    assert.equal(items().length, before + 1);
    const words = ui.querySelector(`[aria-label="Text ${items().filter((i) => i.kind === 'text').length}: words"]`) as HTMLInputElement | null;
    assert.ok(words);
    type(words, 'Phase: {Phase}');
    blur(words);
    assert.equal(items().at(-1)?.kind === 'text' ? (items().at(-1) as { text: string }).text : null, 'Phase: {Phase}');

    click(named(ui, 'Remove Text ' + items().filter((i) => i.kind === 'text').length));
    assert.equal(items().length, before);

    click(button(ui, 'Back to the standard layout'));
    click(button(ui, 'Yes, go back'));
    assert.equal(useProjectStore.getState().titleBlockTemplate, undefined);
  });

  it('keeping the edits when asked to reset leaves the layout alone', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'Edit the layout'));
    click(button(ui, 'Back to the standard layout'));
    click(button(ui, 'Keep them'));
    assert.ok(useProjectStore.getState().titleBlockTemplate);
  });
});
