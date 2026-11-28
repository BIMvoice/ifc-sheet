/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #922: a Bonsai user saves the IFC again and has to load it, open the Wall and open the saved project file by hand,
 * because the reloaded model is filed under its new content hash and the project in front is replaced by an empty one.
 * Reload the IFC model keeps the project: through the real loader (`useIfcLoader.loadFile`) and the real project sync,
 * on a committed pair (`test/fixtures/reload/house-v1.ifc`, `house-v2.ifc`: every GlobalId kept, Wall B moved, the
 * door deleted), the sheets and views are unchanged, the annotations on the walls are kept, and the door's is kept
 * and reported.
 */

import { hook, load, skip } from '@/test/blank-ifc-loader-harness.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { editDrafts, newDraft } from '@/drafting/draft-store';
import { addProjectSheet, resetProject, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { endModelVersionSwap } from '@/project/model-version';
import { useProjectSync } from '@/project/project-sync';
import { useViewerStore } from '@/store';
import { useWhatChanged } from './baseline.js';
import { reloadModel, reloadNotice, reloadRefusal } from './reload.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'reload');
/** Both versions carry the authoring tool's file name: the file is saved over itself. */
const house = (version: 1 | 2) => new File([readFileSync(join(FIXTURES, `house-v${version}.ifc`))], 'house.ifc', { type: 'application/ifc' });
const WALL_A = '2fedArchWallA000000010';
const WALL_B = '2fedArchWallB000000010';
const DOOR = '2fedArchDoor0000000010';

function Sync() {
  useProjectSync();
  return null;
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

beforeEach(() => {
  localStorage.clear();
  resetProject();
  endModelVersionSwap();
  useWhatChanged.setState({ result: null, running: false, message: null });
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe('#922: Reload the IFC model keeps the open project', { skip }, () => {
  it('keeps the sheets, views and annotations, and reports the annotation whose element was deleted', async () => {
    render(<Sync />);
    await load(house(1));
    await settle();
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan' && v.level.name === 'Level 0');
    assert.ok(plan, 'the project has a plan of Level 0');
    const sheetId = addProjectSheet('Ground floor');
    addViewport(sheetId, plan.id, { x: 200, y: 150 }, 50);
    const tagOf = (guid: string) => newDraft(plan.id, '0', { type: 'leader', pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }], text: guid, height: 0.25 }, { tagOf: guid });
    const annotations = [tagOf(WALL_A), tagOf(WALL_B), tagOf(DOOR)];
    editDrafts({ add: annotations });
    const { sheets, views } = useProjectStore.getState();

    const outcome = await reloadModel(house(2), (file) => hook!.loadFile(file, { kind: 'primary' }));
    await settle();

    const after = useProjectStore.getState();
    const models = [...useViewerStore.getState().models.values()];
    assert.equal(models.length, 1, 'the model is replaced, not added to');
    assert.equal(models[0].ifcDataStore?.entityIndex.byType.get('IFCDOOR')?.length ?? 0, 0, 'the new version is the one loaded');
    assert.deepEqual(after.sheets, sheets, 'the sheets are unchanged');
    assert.deepEqual(after.views, views, 'the views are unchanged');
    const kept = new Map(after.drafts.map((d) => [d.id, d]));
    for (const a of annotations) assert.ok(kept.has(a.id), `the annotation of ${a.params.tagOf} is kept`);
    assert.equal(kept.get(annotations[0].id)?.params.tagOf, WALL_A, 'still attached to its wall by GlobalId');
    assert.equal(outcome.lost, 1, 'the door\'s annotation is reported as having lost its element');
    assert.ok(outcome.changed >= 2, `Wall B moved and the door was deleted (${outcome.changed} changes)`);
    assert.match(reloadNotice(outcome, 'house.ifc'), /1 annotation lost its element/);
  });

  it('says why when there is no model to reload, and loads nothing', async () => {
    assert.match(reloadRefusal() ?? '', /No model is loaded/);
    let loaded = false;
    await assert.rejects(reloadModel(house(2), async () => { loaded = true; }), /No model is loaded/);
    assert.equal(loaded, false);
  });
});
