/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The engine and the Wall make the same set from a template (#21), on
 * AC20-FZK-Haus: the Wall through its own start (`startSet`, the template armed
 * as "New project from a set template" arms it), the engine through
 * `generateDefaultSet` with the same template read from the same file text. The
 * sheets, their views, scales and places, and what the rules said, are equal.
 * Two templates: an office's own (plans on A1 at 1:200, under their own name)
 * and one saved from the five-storey bloc-p4, three of whose plan rules this
 * two-storey house cannot meet.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { captureSetTemplate, generateDefaultSet, parseSetTemplate, serializeSetTemplate, type DefaultSet, type SetTemplate } from '@bimvoice/ifcsheet';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { undoDrafts } from '@/drafting/draft-store';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { armTemplate, useSetTemplates } from './store';
import { startSet } from './start';

const BLOC = fileURLToPath(new URL('../../public/samples/bloc-p4.ifc', import.meta.url));

/** A sheet as compared: what it is, and each viewport as its view's name, scale and place. */
function sheetRows(sheets: readonly ProjectSheet[], views: readonly ProjectView[]) {
  return sheets.map((s) => ({
    number: s.number, name: s.name, series: s.series, paper: s.paper, orientation: s.orientation,
    viewports: (s.viewports ?? []).map((vp) => ({ view: views.find((v) => v.id === vp.viewId)?.name, scale: vp.scale, x: vp.x.toFixed(6), y: vp.y.toFixed(6) })),
  }));
}

describe('the engine and the Wall make the same set of AC20-FZK-Haus from a template', { skip: planModelMissing(FZK_HAUS) }, () => {
  let fzkBytes: Uint8Array;
  let office: SetTemplate;
  let bloc: SetTemplate;
  let meshes: ReturnType<typeof modelMeshes>;

  function modelMeshes() {
    return [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  }

  /** What the Wall does when the model opens on an empty project, with `template` armed. */
  function wallSet(template: SetTemplate): { sheets: ProjectSheet[]; views: ProjectView[] } {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent, 'the Wall measures the building');
    armTemplate(template);
    assert.ok(startSet(meshes, extent), 'the Wall lays out a set');
    const { views, sheets } = useProjectStore.getState();
    return { views, sheets };
  }

  async function engineSet(template: SetTemplate): Promise<DefaultSet> {
    const made = generateDefaultSet(await openModel(fzkBytes), { setTemplate: template });
    assert.ok(made, 'the engine lays out a set');
    return made;
  }

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    fzkBytes = new Uint8Array(readFileSync(FZK_HAUS));
    meshes = modelMeshes();
    // The office's set: FZK's own, its plans changed by hand, saved as a file and read back.
    const auto = generateDefaultSet(await openModel(fzkBytes))!;
    const sheets = auto.document.sheets.map((s) => (s.series === 'plans' ? { ...s, name: 'Office plans', paper: 'A1' as const, viewports: (s.viewports ?? []).map((vp) => ({ ...vp, scale: 200 })) } : s));
    office = parseSetTemplate(serializeSetTemplate(captureSetTemplate({ name: 'Office', views: auto.document.views, sheets })));
    const five = generateDefaultSet(await openModel(new Uint8Array(readFileSync(BLOC))))!;
    bloc = parseSetTemplate(serializeSetTemplate(captureSetTemplate({ name: 'Bloc', views: five.document.views, sheets: five.document.sheets })));
  });

  it('the office template: the same sheets, views, scales and places, and the same word on what the rules met', async () => {
    const app = wallSet(office);
    const engine = await engineSet(office);
    assert.deepEqual(sheetRows(app.sheets, app.views), sheetRows(engine.document.sheets, engine.document.views));
    assert.equal(app.sheets[0].name, 'Office plans');
    assert.deepEqual(app.sheets[0].paper, 'A1');
    assert.deepEqual(useSetTemplates.getState().report?.notes.map((n) => [n.key, n.params]), engine.notes.filter((n) => n.key.startsWith('setTemplate.')).map((n) => [n.key, n.params]));
    assert.equal(undoDrafts(), false, 'the set is the starting state, not an undo step');
  });

  it('the template saved from the five-storey block: the same set, and the rules this house cannot meet skipped and said, the same by both', async () => {
    const app = wallSet(bloc);
    const engine = await engineSet(bloc);
    assert.deepEqual(sheetRows(app.sheets, app.views), sheetRows(engine.document.sheets, engine.document.views));
    const said = useSetTemplates.getState().report?.notes.map((n) => [n.key, n.params.storey ?? null]);
    assert.deepEqual(said, [['setTemplate.note.skipped.plan', '+2'], ['setTemplate.note.skipped.plan', '+3'], ['setTemplate.note.skipped.plan', '+4']]);
    assert.deepEqual(said, engine.notes.filter((n) => n.key.startsWith('setTemplate.')).map((n) => [n.key, n.params.storey ?? null]));
  });
});
