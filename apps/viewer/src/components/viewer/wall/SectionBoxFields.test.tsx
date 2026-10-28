/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The section box in a cut-away's card (#97): off or the storey's extent, min and max per axis in metres, a reset, one undo step per
 * edit, in English and Romanian. "Trims the drawing" is asserted the way the engine's own box test does (`axonometric-cutaway.test.ts`):
 * the drawing of the view the card edited lies inside the box, and reset gives the whole wall back.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import type { MeshData } from '@ifc-lite/geometry';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { axonometricCamera, drawAxonometricView, nominalScaleFactor, type SectionBox } from '@bimvoice/ifcsheet/axonometric';
import { blur, cleanup, render, type } from '@/test/render.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import ro from '@/i18n/locales/ro';
import { registerLocale, setLocale } from '@/i18n/registry';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectLevel, ThreeDProjectView } from '@/project/types';
import { SectionBoxFields } from './SectionBoxFields';

const LEVEL: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: ['G'] };
type V3 = { x: number; y: number; z: number };

/** A closed box, outward-wound (the engine test's own). */
function boxMesh(expressId: number, ifcType: string, min: V3, max: V3): MeshData {
  const c = (i: number): number[] => [i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z];
  const positions = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7].flatMap(c));
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);
  return { expressId, ifcType, modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [0.8, 0.8, 0.8, 1] };
}
const WALL = boxMesh(1, 'IfcWall', { x: 0, y: 0, z: 0 }, { x: 4, y: 3, z: 0.3 });
/** What the storey measures as: the wall's own extent. */
const EXTENT: SectionBox = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 0.3 } };
const measure = (): SectionBox => structuredClone(EXTENT);

const VIEW: ThreeDProjectView = {
  id: 'axo', kind: '3d', name: 'Cut-away', createdAt: 0, viewpoint: null, projection: 'axonometric', preset: 'se', scale: 100,
  cutaway: { storey: { level: LEVEL, cutHeight: 1.2 } },
};
const view = (): ThreeDProjectView => useProjectStore.getState().views.find((v) => v.id === 'axo') as ThreeDProjectView;

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ levels: [LEVEL], views: [VIEW] });
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const ui = () => render(<SectionBoxFields view={view()} meshes={null} measure={measure} />);
const redraw = (): ReturnType<typeof render> => { cleanup(); return ui(); };
const select = (el: HTMLSelectElement, value: string) => act(() => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
const field = (root: HTMLElement, which: string) => root.querySelector(`[data-box="${which}"]`) as HTMLInputElement;
const edit = (root: HTMLElement, which: string, text: string): void => { type(field(root, which), text); blur(field(root, which)); };

/** The x range the drawing of the view as the store holds it covers (the engine's box test, on this view). */
async function xRange(): Promise<[number, number]> {
  const v = view();
  const d: Drawing2D = await drawAxonometricView([WALL], v, [LEVEL]);
  const k = nominalScaleFactor(axonometricCamera(v));
  const c = d.config.plane.customPlane!;
  const xs = d.lines.flatMap((l) => [l.line.start, l.line.end].map((p, i) => {
    const depth = i === 0 ? l.depth : l.depthEnd ?? l.depth;
    return c.origin.x + c.tangent.x * (p.x / k) + c.bitangent.x * (p.y / k) - c.normal.x * depth;
  }));
  return [Math.min(...xs), Math.max(...xs)];
}

describe('the section box in the cut-away card', () => {
  it('is off to begin with, and the storey\'s extent turns it on, with the extent in each field', () => {
    const root = ui();
    const mode = root.querySelector('select') as HTMLSelectElement;
    assert.equal(mode.value, 'off');
    assert.equal(root.querySelectorAll('input').length, 0);
    select(mode, 'storey');
    assert.deepEqual(view().cutaway?.box, EXTENT);
    assert.deepEqual(view().cutaway?.storey, { level: LEVEL, cutHeight: 1.2 }, 'the storey cut stays');
    const again = redraw();
    assert.equal(field(again, 'min.x').value, '0');
    assert.equal(field(again, 'max.y').value, '3');
    assert.equal(field(again, 'max.z').value, '0.3');
  });

  it('an edit moves one side in metres (a comma is a decimal point) and the drawing is trimmed to it', async () => {
    const root = ui();
    select(root.querySelector('select') as HTMLSelectElement, 'storey');
    const [from, to] = await xRange();
    assert.ok(from < 0.01 && to > 3.99, `the whole wall to begin with (${from}..${to})`);
    const open = redraw();
    edit(open, 'min.x', '1');
    redraw();
    const again = redraw();
    edit(again, 'max.x', '3,0');
    assert.equal(view().cutaway?.box?.min.x, 1);
    assert.equal(view().cutaway?.box?.max.x, 3);
    const [lo, hi] = await xRange();
    assert.ok(lo > 1 - 1e-3, `drawing starts at the box (${lo})`);
    assert.ok(hi < 3 + 1e-3, `and ends at it (${hi})`);
  });

  it('refuses a side that would leave the box with no volume, and a word that is not a number', () => {
    const root = ui();
    select(root.querySelector('select') as HTMLSelectElement, 'storey');
    const open = redraw();
    edit(open, 'min.x', '5');
    assert.equal(view().cutaway?.box?.min.x, 0);
    edit(redraw(), 'max.y', 'tall');
    assert.equal(view().cutaway?.box?.max.y, 3);
  });

  it('reset gives the storey\'s extent back, and the drawing with it', async () => {
    const root = ui();
    select(root.querySelector('select') as HTMLSelectElement, 'storey');
    edit(redraw(), 'min.x', '1');
    assert.equal(view().cutaway?.box?.min.x, 1);
    const reset = [...redraw().querySelectorAll('button')].find((b) => /Reset to the storey/.test(b.textContent ?? ''))!;
    act(() => { reset.click(); });
    assert.deepEqual(view().cutaway?.box, EXTENT);
    const [lo, hi] = await xRange();
    assert.ok(lo < 0.01 && hi > 3.99, `the whole wall is back (${lo}..${hi})`);
  });

  it('turning it off takes the box away and keeps the storey cut', () => {
    const root = ui();
    select(root.querySelector('select') as HTMLSelectElement, 'storey');
    select(redraw().querySelector('select') as HTMLSelectElement, 'off');
    assert.equal(view().cutaway?.box, undefined);
    assert.deepEqual(view().cutaway?.storey, { level: LEVEL, cutHeight: 1.2 });
  });

  it('is one undo step per edit', () => {
    clearDraftHistory();
    const root = ui();
    select(root.querySelector('select') as HTMLSelectElement, 'storey');
    edit(redraw(), 'min.x', '1');
    edit(redraw(), 'max.x', '3');
    assert.equal(view().cutaway?.box?.max.x, 3);
    assert.equal(undoDrafts(), true);
    assert.equal(view().cutaway?.box?.max.x, 4, 'the last edit alone is undone');
    assert.equal(view().cutaway?.box?.min.x, 1);
    assert.equal(undoDrafts(), true);
    assert.equal(view().cutaway?.box?.min.x, 0);
    assert.equal(undoDrafts(), true);
    assert.equal(view().cutaway?.box, undefined, 'and the first, turning it on');
  });

  it('reads in Romanian', () => {
    registerLocale('ro', ro);
    act(() => setLocale('ro'));
    const root = ui();
    assert.match(root.textContent ?? '', /Casetă de secționare/);
    assert.match(root.textContent ?? '', /Extinderea nivelului/);
    select(root.querySelector('select') as HTMLSelectElement, 'storey');
    const again = redraw();
    assert.match(again.textContent ?? '', /Revenire la extinderea nivelului/);
    assert.match(again.textContent ?? '', /X \(est\), m/);
  });
});
