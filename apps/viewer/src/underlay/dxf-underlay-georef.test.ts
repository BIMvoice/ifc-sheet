/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dxfPointToDrawing } from '@bimvoice/ifcsheet/underlay';
import type { MapConversion } from '@ifc-lite/parser';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import { addDxfUnderlayFromText, setDxfLocked } from './dxf-underlay-actions';
import { mapConversionInMetres, placeDxfUnderlayByGeoreference } from './dxf-underlay-georef';

/** #182: a surveyor's DXF in map coordinates, placed under the site plan by the model's map conversion. */
const DXF = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', 'BOUNDARY', '10', '500100', '20', '6000050', '30', '0', '11', '500140', '21', '6000050', '31', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
const view = 'site-plan';

describe('DXF placed by the model georeference (#182)', () => {
  beforeEach(() => resetProject());

  it('lands the survey point on the model point the map conversion maps to it; a locked DXF is left alone', () => {
    const id = addDxfUnderlayFromText(DXF, 'survey.dxf', view);
    const mc = mapConversionInMetres({ eastings: 500_000, northings: 6_000_000 } as MapConversion, undefined, 1);
    assert.equal(placeDxfUnderlayByGeoreference(id, mc), 'placed');
    const u = useProjectStore.getState().dxfUnderlays!.find((d) => d.id === id)!;
    // The point (500100, 6000050) is 100 m east and 50 m north of the model origin: drawing (100, -50), y runs down.
    const p = dxfPointToDrawing(u, u.layers[0].runs[0][0]);
    assert.ok(Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y + 50) < 1e-6, `${p.x}, ${p.y}`);
    setDxfLocked(id, true);
    assert.equal(placeDxfUnderlayByGeoreference(id, mc), 'locked');
    assert.equal(placeDxfUnderlayByGeoreference(id, null), 'locked');
  });

  it('says so when the model has no usable conversion, and keeps the DXF where it was', () => {
    const id = addDxfUnderlayFromText(DXF, 'survey.dxf', view);
    const before = useProjectStore.getState().dxfUnderlays;
    assert.equal(placeDxfUnderlayByGeoreference(id, null), 'no-georef');
    assert.deepEqual(useProjectStore.getState().dxfUnderlays, before);
  });

  it('reads eastings and northings in the map unit (feet) as metres', () => {
    const mc = mapConversionInMetres({ eastings: 1000, northings: 2000 } as MapConversion, { mapUnitScale: 0.3048 }, 1);
    assert.ok(Math.abs(mc.eastings - 304.8) < 1e-9 && Math.abs(mc.northings - 609.6) < 1e-9);
  });
});
