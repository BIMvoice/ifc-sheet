/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import ro from '@/i18n/locales/ro';
import { registerLocale, setLocale } from '@/i18n/registry';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import type { ProjectLevel, ThreeDProjectView } from '@/project/types';
import { AddDrawing } from './AddDrawing.js';
import { SteppedSheet } from './SteppedSheet.js';
import { drawingArea } from '@/project/drawing-set';
import { CutawayCard } from './CutawayAxoForm.js';

/**
 * "Add a drawing → Cut-away axonometric" (#97): a storey, its default plan cut
 * and a corner make a 3D view cut at that storey; the card changes the cut.
 */

const LEVELS: ProjectLevel[] = [
  { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] },
  { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] },
];

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, sheets: [{ id: 's', number: 'A-101', name: 'Views', createdAt: 0 }] });
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const button = (ui: HTMLElement, text: RegExp) => {
  const b = [...ui.querySelectorAll('button')].find((x) => text.test(x.textContent ?? ''));
  assert.ok(b, `a button ${text}`);
  return b;
};
const select = (el: HTMLSelectElement, value: string) => act(() => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
const cutaways = () => useProjectStore.getState().views.filter((v): v is ThreeDProjectView => v.kind === '3d' && v.cutaway !== undefined);

describe('Add a drawing: cut-away axonometric (#97)', () => {
  it('makes the ground floor cut at its default height, seen from the south-east, and hangs it in one undo step', () => {
    clearDraftHistory();
    const ui = render(<AddDrawing onView={(id) => addViewport('s', id, { x: 10, y: 10 })} onSection={() => {}} onDetail={() => {}} onClose={() => {}} />);
    click(button(ui, /Cut-away axonometric/));
    const [storey, corner] = [...ui.querySelectorAll('select')] as HTMLSelectElement[];
    assert.equal(storey.selectedOptions[0].textContent, 'Ground Floor', 'the lowest storey first');
    assert.equal((ui.querySelector('input') as HTMLInputElement).value, '1.2', 'its default plan cut');
    select(corner, 'nw');
    click(button(ui, /Add the drawing/));
    const [view] = cutaways();
    assert.ok(view, 'a cut-away view was made');
    assert.equal(view.name, 'Ground Floor, cut-away axonometric');
    assert.equal(view.projection, 'axonometric');
    assert.equal(view.preset, 'nw');
    assert.equal(view.scale, 100);
    assert.deepEqual(view.cutaway, { storey: { level: LEVELS[1], cutHeight: 1.2 } });
    assert.equal(useProjectStore.getState().sheets[0].viewports?.[0]?.viewId, view.id, 'hung on the sheet');
    assert.equal(undoDrafts(), true);
    assert.equal(cutaways().length, 0, 'undo takes the view away');
    assert.equal(useProjectStore.getState().sheets[0].viewports?.length ?? 0, 0, 'and its viewport with it');
  });

  it('a storey picked moves the cut to that storey\'s default; a typed height is kept', () => {
    const ui = render(<AddDrawing onView={() => {}} onSection={() => {}} onDetail={() => {}} onClose={() => {}} />);
    click(button(ui, /Cut-away axonometric/));
    select(ui.querySelector('select') as HTMLSelectElement, '0');
    type(ui.querySelector('input') as HTMLInputElement, '0.9');
    click(button(ui, /Add the drawing/));
    assert.deepEqual(cutaways()[0].cutaway?.storey, { level: LEVELS[0], cutHeight: 0.9 });
  });

  it('the card changes the cut height and the storey in place', () => {
    useProjectStore.setState({ views: [{ id: 'axo', kind: '3d', name: 'Cut', createdAt: 0, viewpoint: null, projection: 'axonometric', preset: 'se', cutaway: { storey: { level: LEVELS[1], cutHeight: 1.2 } } }] });
    const view = () => cutaways()[0];
    const ui = render(<CutawayCard view={view()} />);
    const input = ui.querySelector('input') as HTMLInputElement;
    type(input, '1,5');
    blur(input);
    assert.equal(view().cutaway?.storey?.cutHeight, 1.5, 'a comma decimal reads too');
    cleanup();
    const again = render(<CutawayCard view={view()} />);
    select(again.querySelector('select') as HTMLSelectElement, '0');
    assert.deepEqual(view().cutaway?.storey, { level: LEVELS[0], cutHeight: 1.2 });
  });

  it('inside a sheet, the new cut-away lands on the sheet in front at 1:100 (a 3D view has no series of its own)', () => {
    clearDraftHistory();
    const sheet = useProjectStore.getState().sheets[0];
    const ui = render(<SteppedSheet sheet={sheet} extent={{ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } }} proposals={[]} onBack={() => {}} onStep={() => {}} />);
    click(button(ui, /Add a drawing/));
    click(button(ui, /Cut-away axonometric/));
    click(button(ui, /Add the drawing/));
    const [view] = cutaways();
    const vp = useProjectStore.getState().sheets[0].viewports?.[0];
    assert.equal(vp?.viewId, view.id);
    const area = drawingArea(sheet);
    assert.deepEqual([vp?.x, vp?.y, vp?.scale], [area.x + area.w / 2, area.y + area.h / 2, 100]);
    assert.equal(undoDrafts(), true);
    assert.equal(cutaways().length, 0, 'one undo takes the view and its viewport');
    assert.equal(useProjectStore.getState().sheets[0].viewports?.length ?? 0, 0);
  });

  it('reads Romanian', () => {
    act(() => { registerLocale('ro', ro); setLocale('ro'); });
    const ui = render(<AddDrawing onView={() => {}} onSection={() => {}} onDetail={() => {}} onClose={() => {}} />);
    click(button(ui, /Axonometrie secționată/));
    assert.ok(button(ui, /Adăugați desenul/));
    assert.match(ui.textContent ?? '', /Înălțimea de secționare/);
  });
});
