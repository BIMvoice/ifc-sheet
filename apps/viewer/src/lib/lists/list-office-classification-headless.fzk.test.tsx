/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #351 and #78, on AC20-FZK-Haus with an EXAMPLE mapping: a list schedule of the walls grouped by the office classification gives the same
 * rows and groups in the app (`runListSchedule`), headlessly over the engine's provider (`runListScheduleOn`, what `ifcsheet build --project`
 * and the MCP tools call) and from the command line (`ifcsheet list --json`, run as a process). All three wrap their providers with the one
 * `withListClassification`. Every code is an EXAMPLE made up for the test.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { listScheduleTable, type ListScheduleDef } from '@bimvoice/ifcsheet';
import { listScheduleTableOn, openModel, runListScheduleOn } from '@bimvoice/ifcsheet/headless';
import { cleanup } from '@/test/render.js';
import { loadUrbanModel } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addClassificationMapping, setClassificationRule } from '@/classification/classification-actions';
import { listTableSourceOf, runListSchedule } from './list-schedule-run';
import { prepareListProviders } from './prepare-providers';

const FZK = resolve(import.meta.dirname, '../../test/__fixtures__/AC20-FZK-Haus.ifc');
const BIN = resolve(import.meta.dirname, '../../../../../packages/ifcsheet/dist/bin.js');
const TYPE_240 = 'Leichtbeton 102890359 240';
const TYPE_300 = 'Leichtbeton 102890359 300';
const WORDS = { count: 'Count', total: 'Total', yes: 'Yes', no: 'No' };
const TODAY = new Date(0);

const CODE = { id: 'code', source: 'officeClassification', propertyName: 'Code' } as const;
const TITLE = { id: 'title', source: 'officeClassification', propertyName: 'Title' } as const;
const AREA = { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' } as const;
const FILTER = { classes: ['IfcWallStandardCase'] };
/** The issue's list: the walls grouped by the office classification code. */
const WALLS_BY_CODE: ListScheduleDef = { filter: FILTER, columns: [CODE], groupBy: ['code'], totals: false };
/** Code and title, with an area summed per group and the totals row. */
const WALLS_BY_CODE_AREA: ListScheduleDef = { filter: FILTER, columns: [CODE, TITLE, AREA], groupBy: ['code', 'title'], sum: ['area'] };

const bytes = new Uint8Array(readFileSync(FZK));
const reset = () => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); };
const state = () => useViewerStore.getState();

/** The office's table, through the app's own actions. */
function exampleMapping(): void {
  const id = addClassificationMapping('Uniclass', '2015');
  setClassificationRule(id, 'type', TYPE_240, 'EXAMPLE-Ss_25_10', 'EXAMPLE: thick walls');
  setClassificationRule(id, 'type', TYPE_300, 'EXAMPLE-Ss_25_20', 'EXAMPLE: thickest walls');
}

beforeEach(async () => { reset(); await loadUrbanModel('fzk', bytes, []); exampleMapping(); });
afterEach(() => cleanup());

describe('the walls grouped by the office classification: the app, the headless run and the command line agree (#351)', () => {
  for (const [label, list] of Object.entries({ 'by code': WALLS_BY_CODE, 'by code and title, summed': WALLS_BY_CODE_AREA })) {
    it(`gives the same rows and groups ${label}`, async () => {
      const schedule = { id: 's', name: 'Walls', list };
      const { pairs, modelUnits } = prepareListProviders(state(), {});
      const app = await runListSchedule(schedule, pairs, modelUnits, state(), { today: TODAY });
      const appTable = listScheduleTable(listTableSourceOf(app, list, WORDS), list, 'Walls', WORDS);

      const mappings = useProjectStore.getState().classificationMappings ?? [];
      const model = await openModel(bytes, { geometry: false });
      const head = runListScheduleOn(model, schedule, { classificationMappings: mappings, today: TODAY });
      // The headless run names its one model `model`; the app names it by the id it was loaded under. Nothing else may differ.
      const unnamed = (rows: typeof app.result.rows) => rows.map(({ modelId: _, ...row }) => row);
      assert.deepEqual(unnamed(head.result.rows), unnamed(app.result.rows));
      assert.deepEqual(head.result.groups, app.result.groups);
      assert.deepEqual(head.result.summary, app.result.summary);
      assert.deepEqual(head.model, app.model);
      const headTable = listScheduleTableOn(model, schedule, 'en', { classificationMappings: mappings, today: TODAY });
      assert.deepEqual(headTable.header, appTable.header);
      assert.deepEqual(headTable.rows, appTable.rows);

      // The codes are really there: both wall types have theirs, every wall is in a group.
      const codes = (head.result.groups ?? []).filter((g) => g.level === 0).map((g) => g.path?.[0]);
      assert.deepEqual([...codes].sort(), ['EXAMPLE-Ss_25_10', 'EXAMPLE-Ss_25_20']);
      assert.equal(head.result.summary?.count, 13);
      assert.equal((head.result.groups ?? []).filter((g) => g.level === 0).reduce((n, g) => n + g.count, 0), 13);
    });
  }

  it('prints the same rows from `ifcsheet list --json` on the saved project', async (t) => {
    if (!existsSync(BIN)) { t.skip('the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`'); return; }
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-office-parity-'));
    try {
      const file = join(dir, 'p.ifclite-project.json');
      writeFileSync(file, JSON.stringify({
        format: 'ifclite-project', version: 1, classificationMappings: useProjectStore.getState().classificationMappings,
        schedules: [{ id: 'walls', name: 'Walls', kind: 'list', createdAt: 1, list: WALLS_BY_CODE_AREA }],
      }));
      const out = JSON.parse((await promisify(execFile)(process.execPath, [BIN, 'list', FZK, '--project', file, '--json'], { maxBuffer: 64 * 1024 * 1024 })).stdout) as { header: string[]; rows: unknown[][]; totals: unknown[] };
      const { pairs, modelUnits } = prepareListProviders(state(), {});
      const app = await runListSchedule({ id: 's', name: 'Walls', list: WALLS_BY_CODE_AREA }, pairs, modelUnits, state(), { today: TODAY });
      const appTable = listScheduleTable(listTableSourceOf(app, WALLS_BY_CODE_AREA, WORDS), WALLS_BY_CODE_AREA, 'Walls', WORDS);
      const total = appTable.bold[0];
      assert.deepEqual(out.header, appTable.header);
      assert.deepEqual(out.rows, appTable.rows.filter((_, i) => i !== total));
      assert.deepEqual(out.totals, appTable.rows[total]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
