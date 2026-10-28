/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The German standards pack (#365) on AC20-FZK-Haus, through the app's own start of a project: "Install standard" sets the
 * German values in one undo step, and they are not the Romanian pack's.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { GERMAN_PRACTICE, ROMANIAN_PRACTICE, graphicStandardOf } from '@/drafting/graphic-standard';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { GERMANY_PACK_ID, germanyPack, romaniaPack } from './standard-pack';
import { parseStandardPack, serializeStandardPack } from './standard-pack-file';
import { installStandard, isApplied, resetStandard } from './standard-pack-install';

const state = () => useProjectStore.getState();
const captions = (): string[] => (state().titleBlockTemplate?.items ?? []).flatMap((i) => (i.kind === 'text' ? [i.text] : []));

describe('the German standards pack on AC20-FZK-Haus (#365)', { skip: planModelMissing(FZK_HAUS) }, () => {
  before(async () => { await loadPlanModel(FZK_HAUS); });

  beforeEach(() => {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const extent = setExtent(state().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    clearDraftHistory();
  });

  it('installs the German pens, title block captions and number format, and not the Romanian ones', () => {
    installStandard(germanyPack());
    const s = state();
    assert.equal(s.graphicStandard, 'de-practice');
    assert.equal(graphicStandardOf(s.graphicStandard), GERMAN_PRACTICE);
    assert.equal(graphicStandardOf(s.graphicStandard).pens.cut, 0.5, 'the German cut pen; the Romanian one is 0.7');
    assert.notEqual(s.graphicStandard, ROMANIAN_PRACTICE.id);
    for (const caption of ['Bauvorhaben', 'Bauherr', 'Entwurfsverfasser', 'Planinhalt', 'Maßstab']) assert.ok(captions().includes(caption), caption);
    assert.ok(!captions().includes('Proiectant general'));
    assert.deepEqual(s.unitsAndNumbers, { separator: 'comma' });
    assert.deepEqual(s.textStyles?.map((x) => x.id).filter((id) => id.startsWith('de-')), ['de-text-25', 'de-text-35', 'de-title-50', 'de-title-70']);
    assert.deepEqual(s.installedStandard?.id, GERMANY_PACK_ID);
    assert.equal(isApplied(germanyPack()), true);
    assert.equal(isApplied(romaniaPack((k) => k)), false);
  });

  it('one undo takes all of it back, and there is no second step', () => {
    installStandard(germanyPack());
    assert.equal(undoDrafts(), true);
    assert.equal(state().graphicStandard, undefined);
    assert.equal(state().titleBlockTemplate, undefined);
    assert.equal(state().unitsAndNumbers, undefined);
    assert.equal(state().installedStandard, undefined);
    assert.equal(undoDrafts(), false);
  });

  it('reset returns the project to its own values', () => {
    installStandard(germanyPack());
    assert.equal(resetStandard(), true);
    assert.equal(state().graphicStandard, undefined);
    assert.equal(state().unitsAndNumbers, undefined);
  });

  it('round-trips through .bvlib', () => {
    const back = parseStandardPack(serializeStandardPack(germanyPack(), new Date(0)));
    assert.equal(back.id, GERMANY_PACK_ID);
    assert.equal(back.graphicStandard, 'de-practice');
    assert.deepEqual(back.unitsAndNumbers, { separator: 'comma' });
  });
});
