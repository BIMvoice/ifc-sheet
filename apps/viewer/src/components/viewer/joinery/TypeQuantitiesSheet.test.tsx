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
import { typeQuantities } from '@/joinery/type-quantities';
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
});
