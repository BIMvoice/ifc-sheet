/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The CAD layer standard is saved in the project (file and package) and in
 * the library file (`.bvlib`), in rule order, and merges under the library's
 * clash policies.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectFile, serializeProject } from '@/project/project-file.js';
import { buildPackage, readPackage } from '@/project/package/package-io.js';
import { EMPTY_PROJECT, loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';
import { isoStarterRules } from '@/project/cad-layers-iso.js';
import { resetCadRulesToIso, addCadRule, updateCadRule, removeCadRule, moveCadRule } from '@/project/cad-layers-edit.js';
import type { CadLayerRule } from '@/project/cad-layers.js';
import type { ProjectDocument } from '@/project/types.js';
import { emptyCatalogue, parseCatalogue, selectKinds, serializeCatalogue } from './catalogue-file.js';
import { mergeCatalogues } from './catalogue-merge.js';
import { importCatalogueText, projectCatalogue } from './catalogue-store.js';

// Material rule below the class rule on purpose: the order in the file is the order in the table.
const rules: CadLayerRule[] = [
  { id: 'r1', source: 'CUT', ifcClasses: ['IfcWall', 'IfcWallStandardCase'], layer: 'A-WALL-CUT', color: '#7f1d1d', lineWeight: 0.5 },
  { id: 'r2', source: 'CUT', ifcClasses: ['IfcWall'], material: 'Beton armat', layer: 'Pereți ș ț ă', color: '#ff0000', lineWeight: 0.7, lineType: 'dashed' },
  { id: 'r3', kind: 'dimension', layer: 'A-ANNO-DIMS' },
];
const doc: ProjectDocument = { ...EMPTY_PROJECT, name: 'House', cadLayers: rules };

describe('CAD layers in the project', () => {
  it('survive the project file, in order, diacritics intact', () => {
    assert.deepEqual(parseProjectFile(serializeProject(doc)).cadLayers, rules);
  });

  it('survive the project file with the whole ISO starter', () => {
    const starter = isoStarterRules();
    assert.deepEqual(parseProjectFile(serializeProject({ ...doc, cadLayers: starter })).cadLayers, starter);
  });

  it('survive the project package', async () => {
    const { files } = await buildPackage({ projectId: 'p', doc, models: [] });
    assert.deepEqual((await readPackage(files)).doc.cadLayers, rules);
  });

  it('are empty in a project saved before they existed', () => {
    const old = JSON.parse(serializeProject(doc));
    delete old.cadLayers;
    assert.deepEqual(parseProjectFile(JSON.stringify(old)).cadLayers, []);
  });

  it('fail with the path when a rule is malformed, and drop a malformed optional field', () => {
    const bad = JSON.parse(serializeProject(doc));
    bad.cadLayers[1] = { id: 'x' };
    assert.throws(() => parseProjectFile(JSON.stringify(bad)), /cadLayers\/1/);
    const lenient = JSON.parse(serializeProject(doc));
    lenient.cadLayers[0].color = 'red';
    lenient.cadLayers[0].lineWeight = -1;
    lenient.cadLayers[0].lineType = 'wavy';
    const [r] = parseProjectFile(JSON.stringify(lenient)).cadLayers ?? [];
    assert.deepEqual(r, { id: 'r1', source: 'CUT', ifcClasses: ['IfcWall', 'IfcWallStandardCase'], layer: 'A-WALL-CUT' });
  });
});

describe('CAD layers in the library file', () => {
  it('round-trip through .bvlib, in order', () => {
    const text = serializeCatalogue(selectKinds({ ...emptyCatalogue(), cadLayers: rules }, new Set(['cadLayers'])), 'Office');
    assert.deepEqual(parseCatalogue(text).catalogue.cadLayers, rules);
  });

  it('are left out of a file exported without them, and empty in a file saved before they existed', () => {
    const without = serializeCatalogue(selectKinds({ ...emptyCatalogue(), cadLayers: rules }, new Set(['layers'])), 'Office');
    assert.deepEqual(parseCatalogue(without).catalogue.cadLayers, []);
    const old = JSON.parse(without);
    delete old.cadLayers;
    assert.deepEqual(parseCatalogue(JSON.stringify(old)).catalogue.cadLayers, []);
  });

  it('fail with the path when malformed', () => {
    const bad = JSON.parse(serializeCatalogue({ ...emptyCatalogue(), cadLayers: rules }, 'Office'));
    bad.cadLayers[2] = { id: 'x', layer: '' };
    assert.throws(() => parseCatalogue(JSON.stringify(bad)), /Not a library file: \/cadLayers\/2/);
  });
});

describe('merging a CAD layer table', () => {
  const mine = { ...emptyCatalogue(), cadLayers: [{ id: 'm1', source: 'CUT', ifcClasses: ['IfcWall', 'IfcWallStandardCase'], layer: 'MINE' }] };
  const theirs = { ...emptyCatalogue(), cadLayers: [{ ...rules[0], id: 'r1' }, rules[2]] };
  let n = 0;
  const fresh = (p: string) => `${p}-${++n}`;

  it('keeps the project\'s rule on a clash under "mine", and adds the rest', () => {
    const { catalogue, report } = mergeCatalogues(mine, theirs, 'mine', fresh);
    assert.deepEqual(catalogue.cadLayers.map((r) => r.layer), ['MINE', 'A-ANNO-DIMS']);
    assert.deepEqual(report.cadLayers, { added: 1, kept: 1, replaced: 0, renamed: 0 });
  });

  it('replaces it in place under "theirs", keeping the project\'s order and id', () => {
    const { catalogue, report } = mergeCatalogues(mine, theirs, 'theirs', fresh);
    assert.deepEqual(catalogue.cadLayers.map((r) => [r.id, r.layer]), [['m1', 'A-WALL-CUT'], ['r3', 'A-ANNO-DIMS']]);
    assert.equal(report.cadLayers.replaced, 1);
  });

  it('drops a rule with the same criteria under "both": only the first could ever match (PR #112 review)', () => {
    const { catalogue, report } = mergeCatalogues(mine, theirs, 'both', fresh);
    assert.deepEqual(catalogue.cadLayers.map((r) => r.layer), ['MINE', 'A-ANNO-DIMS']);
    assert.deepEqual(report.cadLayers, { added: 1, kept: 1, replaced: 0, renamed: 0 });
    // Criteria compare as matching does: class case and order, material spacing and case.
    const spelled = { ...emptyCatalogue(), cadLayers: [{ id: 't', source: ' cut ', ifcClasses: ['IFCWALLSTANDARDCASE', 'ifcwall'], layer: 'DEAD' }] };
    assert.deepEqual(mergeCatalogues(mine, spelled, 'both', fresh).catalogue.cadLayers.map((r) => r.layer), ['MINE']);
    // Two incoming rules with one criterion: the second is as dead as one shadowed by the project.
    const twice = { ...emptyCatalogue(), cadLayers: [{ id: 'a', kind: 'text' as const, layer: 'T1' }, { id: 'b', kind: 'text' as const, layer: 'T2' }] };
    assert.deepEqual(mergeCatalogues(emptyCatalogue(), twice, 'both', fresh).catalogue.cadLayers.map((r) => r.layer), ['T1']);
  });

  it('treats a rule identical to one the project has as no clash', () => {
    const same = mergeCatalogues({ ...mine, cadLayers: theirs.cadLayers }, theirs, 'both', fresh);
    assert.deepEqual(same.catalogue.cadLayers, theirs.cadLayers);
    assert.equal(same.report.cadLayers.kept, 2);
  });
});

describe('the CAD layer table in the project store', () => {
  beforeEach(() => resetProject());

  it('imports from a library file, marks the project edited, and saves and loads back', () => {
    const file = serializeCatalogue(projectCatalogue({ ...useProjectStore.getState(), ...doc }), 'Other');
    importCatalogueText(file, 'mine');
    assert.deepEqual(useProjectStore.getState().cadLayers, rules);
    assert.equal(useProjectStore.getState().dirty, true);
    const saved = projectDocument();
    resetProject();
    loadProjectDocument(parseProjectFile(serializeProject(saved)));
    assert.deepEqual(useProjectStore.getState().cadLayers, rules);
  });

  it('edits: add, change, move, remove, reset to the ISO starter', () => {
    resetCadRulesToIso();
    assert.deepEqual(useProjectStore.getState().cadLayers, isoStarterRules());
    const id = addCadRule('NEW');
    updateCadRule(id, { ifcClasses: ['IfcSlab'], lineWeight: 0.35 });
    const list = useProjectStore.getState().cadLayers ?? [];
    assert.deepEqual(list.at(-1), { id, layer: 'NEW', ifcClasses: ['IfcSlab'], lineWeight: 0.35 });
    moveCadRule(id, -1);
    assert.equal(useProjectStore.getState().cadLayers?.at(-2)?.id, id);
    removeCadRule(id);
    assert.deepEqual(useProjectStore.getState().cadLayers, isoStarterRules());
    assert.equal(useProjectStore.getState().dirty, true);
  });
});
