/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dxfPointToDrawing } from '@bimvoice/ifcsheet/underlay';
import { cleanup, render } from '@/test/render.js';
import { draftCommandByName } from '@/drafting/commands/registry.js';
import type { DraftContext } from '@/drafting/commands/types';
import { dxfSnapShapes, withDxfSnapShapes } from '@/drafting/dxf-underlay-snap';
import { findSnap } from '@/drafting/snaps';
import type { SnapMode } from '@/drafting/types';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { addDxfUnderlayFromText, setDxfLayerVisible, setDxfLocked, setDxfPrintsOn } from './dxf-underlay-actions';

/**
 * #547: a consultant's DXF floor plan laid under a plan of the model: aligned by two picked points, its layers on or off, snapped to like
 * the model's lines, and printed on the sheets chosen (the layers that are on).
 */

/** A DXF of two layers in millimetres: WALLS a 4 m x 3 m outline, FURNITURE one 1 m line. */
const line = (layer: string, x0: number, y0: number, x1: number, y1: number): string => ['0', 'LINE', '8', layer, '10', `${x0}`, '20', `${y0}`, '30', '0', '11', `${x1}`, '21', `${y1}`, '31', '0'].join('\n');
const DXF = [
  '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER',
  '0', 'LAYER', '2', 'WALLS', '70', '0', '62', '1', '0', 'LAYER', '2', 'FURNITURE', '70', '0', '62', '3', '0', 'ENDTAB', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  line('WALLS', 0, 0, 4000, 0), line('WALLS', 4000, 0, 4000, 3000), line('WALLS', 4000, 3000, 0, 3000), line('WALLS', 0, 3000, 0, 0),
  line('FURNITURE', 1000, 1000, 2000, 1000),
  '0', 'ENDSEC', '0', 'EOF', '',
].join('\n');

const view = { id: 'plan-1', kind: 'plan', name: 'Ground floor', scale: 100 } as unknown as ProjectView;
const sheetA: ProjectSheet = { id: 'sheet-a', number: 'A-101', name: 'Plans', createdAt: 0, viewports: [{ id: 'vp-a', viewId: 'plan-1', x: 200, y: 150, scale: 100, width: 300, height: 200, center: { x: 0, y: 0 } }] };
const sheetB: ProjectSheet = { ...sheetA, id: 'sheet-b', number: 'A-102', viewports: [{ ...sheetA.viewports![0]!, id: 'vp-b' }] };

beforeEach(() => resetProject());
afterEach(() => { cleanup(); resetProject(); });

const get = (id: string) => {
  const u = useProjectStore.getState().dxfUnderlays?.find((o) => o.id === id);
  assert.ok(u);
  return u;
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const ALL: ReadonlySet<SnapMode> = new Set<SnapMode>(['endpoint', 'midpoint']);

describe('a DXF aligned to the model by two picked points (#547)', () => {
  it('DXFALIGN puts the DXF corner on the model corner and the far corner on the far corner, within 1 mm', () => {
    const id = addDxfUnderlayFromText(DXF, 'plan.dxf', view.id);
    const u0 = get(id);
    // Millimetres were read as metres: the unit is the file's $INSUNITS, so the corners are 4 m and 3 m away already.
    const cornerA = dxfPointToDrawing(u0, { x: 0, y: 0 });
    const cornerB = dxfPointToDrawing(u0, { x: 4, y: -3 });
    // The model's corners, 12.5 m east and 8 m south of where the DXF landed, and the model's wall is 1 % longer than the DXF's.
    const modelA = { x: 12.5, y: 8 };
    const modelB = { x: 12.5 + 4.04, y: 8 - 3.03 };
    const said: string[] = [];
    const command = draftCommandByName('DXFALIGN')!.create({ viewId: view.id, say: (key: string) => said.push(key) } as unknown as DraftContext);
    for (const p of [cornerA, cornerB, modelA, modelB]) command.onPoint?.(p);
    assert.deepEqual(said, ['dxfView.msg.aligned']);
    const u = get(id);
    assert.ok(dist(dxfPointToDrawing(u, { x: 0, y: 0 }), modelA) < 0.001);
    assert.ok(dist(dxfPointToDrawing(u, { x: 4, y: -3 }), modelB) < 0.001);
  });

  it('a locked DXF is not moved, and the person is told', () => {
    const id = addDxfUnderlayFromText(DXF, 'plan.dxf', view.id);
    setDxfLocked(id, true);
    const before = get(id);
    const said: string[] = [];
    const command = draftCommandByName('DXFALIGN')!.create({ viewId: view.id, say: (key: string) => said.push(key) } as unknown as DraftContext);
    command.onPoint?.({ x: 0, y: 0 });
    assert.deepEqual(said, ['dxfView.msg.locked']);
    assert.deepEqual(get(id), before);
  });
});

describe('snapping to the DXF like model linework (#547)', () => {
  it('the cursor near a DXF corner snaps to that corner; with the layer off it does not', () => {
    const id = addDxfUnderlayFromText(DXF, 'plan.dxf', view.id);
    const corner = dxfPointToDrawing(get(id), { x: 4, y: -3 });
    const near = { x: corner.x + 0.02, y: corner.y - 0.01 };
    const state = () => useProjectStore.getState().dxfUnderlays;

    const set = withDxfSnapShapes(null, state(), view.id);
    assert.ok(set);
    const hit = findSnap(near, set.shapes, set.index, { tolerance: 0.1, modes: ALL });
    assert.equal(hit?.mode, 'endpoint');
    assert.ok(hit && dist(hit.point, corner) < 1e-9);

    setDxfLayerVisible(id, 'WALLS', false);
    assert.equal(withDxfSnapShapes(null, state(), view.id)?.shapes.length, 1, 'only the furniture line is left');
    const furniture = dxfSnapShapes(state(), view.id);
    assert.equal(findSnap(near, furniture, null, { tolerance: 0.1, modes: ALL }), null);
  });

  it('the DXF of another view offers nothing', () => {
    addDxfUnderlayFromText(DXF, 'plan.dxf', view.id);
    assert.equal(dxfSnapShapes(useProjectStore.getState().dxfUnderlays, 'plan-2').length, 0);
  });
});

describe('what a sheet prints of a DXF (#547)', () => {
  const svgOf = (sheet: ProjectSheet) => {
    const ui = render(<SheetPaper sheet={sheet} projectName="House" content={() => ({ view, drawing: null, drafts: [] })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
    const live = ui.querySelector('svg');
    assert.ok(live);
    return live as unknown as SVGSVGElement;
  };
  const layersOn = (sheet: ProjectSheet): string[] => Array.from(svgOf(sheet).querySelectorAll('polyline[data-dxf-layer]')).map((p) => p.getAttribute('data-dxf-layer') ?? '');

  it('prints the layers that are on, on the sheets chosen and on no other', () => {
    const id = addDxfUnderlayFromText(DXF, 'plan.dxf', view.id);
    assert.deepEqual(layersOn(sheetA), [], 'not printed until chosen');
    setDxfPrintsOn(id, sheetA.id, true);
    assert.equal(new Set(layersOn(sheetA)).size, 2);
    assert.deepEqual(layersOn(sheetB), []);

    cleanup();
    setDxfLayerVisible(id, 'FURNITURE', false);
    assert.deepEqual([...new Set(layersOn(sheetA))], ['WALLS'], 'a layer that is off is not printed');
  });
});
