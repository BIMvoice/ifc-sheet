/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The quantities by type placed on an A-6xx sheet: the sheet's SVG and its
 * DXF carry the FZK-Haus type names and their figures, as the sheet is drawn.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@/test/render.js';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet, addScheduleToSet } from '@/project/drawing-set-actions';
import { updateViewport } from '@/project/sheets';
import { typeQuantities } from '@bimvoice/ifcsheet';
import { collectTypeElements } from '@/joinery/type-quantities-models';
import { WallSheet } from '../wall/WallSheet';
import { sheetSvgText } from '../sheets/sheet-export';
import { sheetDxf } from '../sheets/sheet-dxf';

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('quantities by type on a sheet', () => {
  // Review of #108: every geometry-bearing entity was read, so FZK-Haus's 17 IfcOpeningElement became type rows.
  it('lists physical elements only: no openings or other features of an element', async () => {
    const store = await parseStep(new Uint8Array(readFileSync(new URL('../../../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url))));
    useViewerStore.setState({ models: new Map([['fzk', { id: 'fzk', name: 'fzk', ifcDataStore: store, visible: true } as never]]) });
    const classes = new Set(collectTypeElements().map((e) => e.className));
    assert.ok(classes.has('IfcWall') || classes.has('IfcWallStandardCase'), `walls are listed (${[...classes].join(', ')})`);
    for (const notPhysical of ['IfcOpeningElement', 'IfcSite', 'IfcBuildingStorey', 'IfcSpace']) {
      assert.ok(!classes.has(notPhysical), `${notPhysical} is not listed`);
    }
  });

  it('prints the FZK-Haus wall types and their volumes into the sheet SVG and the DXF', async () => {
    const store = await parseStep(new Uint8Array(readFileSync(new URL('../../../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url))));
    useViewerStore.setState({ models: new Map([['fzk', { id: 'fzk', name: 'fzk', ifcDataStore: store, visible: true } as never]]) });
    startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
    const sheetId = addScheduleToSet('types', 'Quantities by type');
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    assert.match(sheet.number, /^A-6\d\d$/);

    const ui = render(<WallSheet sheet={sheet} width={1000} />);
    const svg = ui.querySelector<SVGSVGElement>(`svg[data-sheet-id="${sheet.id}"]`);
    assert.ok(svg, 'the sheet is drawn');
    const text = sheetSvgText(svg, sheet);

    const walls = typeQuantities(collectTypeElements()).rows.filter((r) => r.className === 'IfcWallType');
    assert.equal(walls.length, 2);
    for (const r of walls) {
      assert.ok(text.includes(`>${r.typeName}<`), `${r.typeName} in the SVG`);
      assert.ok(text.includes(`>${r.total.volume!.toFixed(2)}<`), `${r.typeName} volume ${r.total.volume!.toFixed(2)} in the SVG`);
    }
    assert.ok(text.includes('>Quantities by type<'));

    const dxf = new TextDecoder().decode(sheetDxf(svg, sheet));
    for (const r of walls) {
      assert.ok(dxf.includes(r.typeName!), `${r.typeName} in the DXF`);
      assert.ok(dxf.includes(r.total.volume!.toFixed(2)), `${r.typeName} volume in the DXF`);
    }
  });

  // #186: a box shorter than the table continues it on A-6xx.1…, the sheet's own effect adding the sheets, and each page holds its rows.
  it('continues on further sheets when its viewport is shorter than the table, every type on one page', async () => {
    const store = await parseStep(new Uint8Array(readFileSync(new URL('../../../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url))));
    useViewerStore.setState({ models: new Map([['fzk', { id: 'fzk', name: 'fzk', ifcDataStore: store, visible: true } as never]]) });
    startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
    const sheetId = addScheduleToSet('types', 'Quantities by type');
    const first = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    const vp = first.viewports![0];
    assert.ok(vp.width > 0 && vp.height > 0, 'hung with a box: the drawing area');
    // A box 40 mm tall holds a few lines of a table that has more.
    updateViewport(first.id, vp.id, { height: 40, y: vp.y - vp.height / 2 + 20 });
    const held = () => useProjectStore.getState().sheets.filter((s) => (s.viewports ?? []).some((v) => v.viewId === vp.viewId)).sort((a, b) => a.number.localeCompare(b.number));
    const pagesText = held().map((sheet) => {
      const ui = render(<WallSheet sheet={sheet} width={1000} />);
      const svg = ui.querySelector<SVGSVGElement>(`svg[data-sheet-id="${sheet.id}"]`)!;
      const text = sheetSvgText(svg, sheet);
      cleanup();
      return text;
    });
    assert.ok(held().length > 1, `the table continues on further sheets (${held().length})`);
    assert.equal(pagesText.length, 1, 'only the first sheet existed when it was drawn; the effect added the rest');
    const all = held().map((sheet) => {
      const ui = render(<WallSheet sheet={sheet} width={1000} />);
      const text = sheetSvgText(ui.querySelector<SVGSVGElement>(`svg[data-sheet-id="${sheet.id}"]`)!, sheet);
      cleanup();
      return text;
    });
    const walls = typeQuantities(collectTypeElements()).rows.filter((r) => r.className === 'IfcWallType');
    for (const r of walls) assert.equal(all.filter((t) => t.includes(`>${r.typeName}<`)).length, 1, `${r.typeName} is on exactly one page`);
    assert.ok(all.every((t) => t.includes('Quantities by type')), 'every page carries the title');
  });
});
