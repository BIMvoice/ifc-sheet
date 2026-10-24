/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #256: the Model workspace's plan pane cuts a storey where the sheet plan
 * does, not at a plain floor + 1.2 m. Read from the real #234 fixture
 * (`plan-cut-below-next-slab.ifc`): Lower at 0.0 m with Upper 1.0 m above gets
 * exactly 0.5 m (min(1.2, max(1.0 - 0.5, 1.0 / 2))), the top storey exactly 1.2 m.
 */
import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IfcParser } from '@ifc-lite/parser';
import { sheetCutHeights } from '@/test/close-storeys-fixture.js';
import { storeyPlanCutHeight } from './usePlanCut.js';

const FIXTURE = new URL('../../../project/__fixtures__/plan-cut-below-next-slab.ifc', import.meta.url);

describe('storeyPlanCutHeight (#256)', () => {
  it('cuts the storey 1.0 m below the next at exactly 0.5 m, the top storey at 1.2 m', async () => {
    const bytes = new Uint8Array(await readFile(FIXTURE));
    const store = await new IfcParser().parseColumnar(bytes.slice().buffer, { disableWorkerScan: true });
    const byElevation = new Map([...(store.spatialHierarchy?.storeyElevations ?? [])].map(([id, e]) => [e, id]));
    assert.deepEqual([...byElevation.keys()].sort(), [0, 1]);
    const sheet = sheetCutHeights();
    assert.equal(storeyPlanCutHeight(store, null, byElevation.get(0)!), 0.5);
    assert.equal(storeyPlanCutHeight(store, null, byElevation.get(0)!), sheet.Lower);
    assert.equal(storeyPlanCutHeight(store, null, byElevation.get(1)!), 1.2);
    assert.equal(sheet.Upper, 1.2);
  });
});
