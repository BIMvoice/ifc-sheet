/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateDefaultSet, germanySetTemplate, type GermanyLand } from '@bimvoice/ifcsheet';
import { undoDrafts } from '@/drafting/draft-store';
import { resolve } from '@/i18n/registry';
import { resetProject, setPermitPack, useProjectStore } from '@/project/project-store';
import { armTemplate, useSetTemplates } from '@/set-template/store';
import { isSitePlan } from '@/siteplan/plot';
import { chooseGermanyLand } from './germany-land';
import { germanyTemplateFor } from './germany-template';

/**
 * Changing the Land of a Germany project (#372): the Lageplan follows the Land's scale, and Baden-Württemberg alone has the
 * Abstandsflächenplan sheet, all as ONE undo step with the Land itself. A Land read once when the template was armed went stale.
 */

const t = resolve;
const SETBACK = 'Abstandsflächenplan';
const EXTENT = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 6, z: 9 } };
const NAMES = { name: 'Germany', plans: 'Plans', sections: 'Sections', elevations: 'Elevations', site: 'Site plan (Lageplan)', siteNotes: ['Scale note', 'To add note'], setback: SETBACK, setbackNotes: ['Setback note'] };

/** The project as the Germany set of `land` made it, in the pack, with the Land chosen. */
function project(land: GermanyLand): void {
  while (undoDrafts());
  resetProject();
  const { document: doc } = generateDefaultSet({
    storeys: [{ name: 'Ground', elevation: 0, globalId: 'g0' }, { name: 'First', elevation: 3, globalId: 'g1' }],
    extent: EXTENT,
    proposalInput: () => null,
  }, { setTemplate: germanySetTemplate(NAMES, land), now: 0 })!;
  useProjectStore.setState({ views: doc.views, sheets: doc.sheets });
  setPermitPack('germany');
  useProjectStore.setState({ germanyLand: land });
}

const sites = () => useProjectStore.getState().views.filter((v) => isSitePlan(v) && !v.detail);
const sheetOf = (viewId: string) => useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === viewId));
/** The scale the Lageplan is drawn at on its sheet, and its view's scale. */
const lageplanScales = () => {
  const [site] = sites();
  return [sheetOf(site.id)!.viewports!.find((vp) => vp.viewId === site.id)!.scale, site.scale];
};
const names = () => useProjectStore.getState().sheets.map((s) => s.name);

beforeEach(() => armTemplate(null));
afterEach(() => { while (undoDrafts()); armTemplate(null); });

describe('changing the Land of a Germany project', () => {
  it('draws the Lageplan at the new Land\'s scale, on the sheet and on the view', () => {
    project('bayern');
    assert.deepEqual(lageplanScales(), [1000, 1000]);
    chooseGermanyLand('nrw', t, EXTENT);
    assert.equal(useProjectStore.getState().germanyLand, 'nrw');
    assert.deepEqual(lageplanScales(), [500, 500]);
    chooseGermanyLand('bayern', t, EXTENT);
    assert.deepEqual(lageplanScales(), [1000, 1000]);
    chooseGermanyLand(undefined, t, EXTENT);
    assert.deepEqual(lageplanScales(), [500, 500], 'no Land reads as any other Land: 1:500');
  });

  it('adds the Abstandsflächenplan when the Land becomes Baden-Württemberg: a second ground-floor cut on a sheet of its own, with the note that the Abstandsflächen are to be drawn', () => {
    project('bayern');
    const before = names();
    chooseGermanyLand('bw', t, EXTENT);
    assert.deepEqual(names(), [...before, SETBACK]);
    const [lageplan, second] = sites();
    assert.equal(sites().length, 2);
    assert.equal(second.kind === 'plan' && lageplan.kind === 'plan' && second.level.name === lageplan.level.name, true, 'the same storey cut');
    assert.equal(second.scale, 500);
    const sheet = sheetOf(second.id)!;
    assert.equal(sheet.name, SETBACK);
    assert.deepEqual(sheet.notes, [t('germany.set.setbackNote')]);
    assert.match(sheet.notes![0], /still to be drawn in/);
    assert.equal(sheet.viewports!.length, 1);
    assert.equal(sheet.viewports![0].scale, 500);
    assert.deepEqual(lageplanScales(), [500, 500]);
  });

  it('takes the untouched Abstandsflächenplan away when the Land leaves Baden-Württemberg, and keeps one with a drawing on it', () => {
    project('bw');
    assert.equal(names().includes(SETBACK), true);
    chooseGermanyLand('nrw', t, EXTENT);
    assert.equal(names().includes(SETBACK), false);
    assert.equal(sites().length, 1);

    project('bw');
    const [, second] = sites();
    useProjectStore.setState({ drafts: [{ id: 'd1', viewId: second.id, layerId: '0', params: {}, shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } }] });
    chooseGermanyLand('bayern', t, EXTENT);
    assert.equal(names().includes(SETBACK), true, 'the person\'s drawing is not thrown away');
    assert.equal(useProjectStore.getState().drafts.length, 1);
    assert.deepEqual(lageplanScales(), [1000, 1000]);
  });

  it('is ONE undo step: the Land, the scale and the sheet come back together', () => {
    project('bayern');
    const sheetsBefore = useProjectStore.getState().sheets;
    chooseGermanyLand('bw', t, EXTENT);
    assert.equal(names().includes(SETBACK), true);
    assert.equal(undoDrafts(), true);
    assert.equal(useProjectStore.getState().germanyLand, 'bayern');
    assert.deepEqual(lageplanScales(), [1000, 1000]);
    assert.deepEqual(names(), sheetsBefore.map((s) => s.name));
    assert.equal(sites().length, 1);
  });

  it('makes no sheet without a model extent, but still sets the scale; and leaves the sheets alone outside the Germany pack', () => {
    project('bayern');
    chooseGermanyLand('bw', t, null);
    assert.equal(names().includes(SETBACK), false);
    assert.deepEqual(lageplanScales()[0], 500);

    project('bayern');
    setPermitPack('norway');
    chooseGermanyLand('nrw', t, EXTENT);
    assert.equal(useProjectStore.getState().germanyLand, 'nrw');
    assert.deepEqual(lageplanScales(), [1000, 1000], 'not a Germany project: the sheets are not this pack\'s to change');
  });

  it('makes the armed Germany template again for the new Land, and leaves another armed template alone', () => {
    armTemplate(germanyTemplateFor(t, 'bayern'));
    chooseGermanyLand('bw', t, null);
    const pending = useSetTemplates.getState().pending!;
    assert.deepEqual(pending.sheets.map((s) => s.slots.map((sl) => sl.scale)).at(-1), [500]);
    assert.equal(pending.sheets.length, 5, 'the Baden-Württemberg set has the Abstandsflächenplan');
    chooseGermanyLand('bayern', t, null);
    assert.equal(useSetTemplates.getState().pending!.sheets.length, 4);
    assert.deepEqual(useSetTemplates.getState().pending!.sheets.at(-1)!.slots.map((sl) => sl.scale), [1000]);

    armTemplate({ ...germanyTemplateFor(t, 'bayern'), name: 'Mine' });
    chooseGermanyLand('bw', t, null);
    assert.equal(useSetTemplates.getState().pending!.sheets.length, 4);
  });
});
