/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The catalogue file: a catalogue survives export → read exactly, a foreign,
 * newer or malformed file is refused with the path, and merging into another
 * project follows the clash policy and carries references along.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { parseCatalogue, selectKinds, serializeCatalogue, emptyCatalogue, type Catalogue } from './catalogue-file.js';
import { mergeCatalogues } from './catalogue-merge.js';
import { DEFAULT_LEGEND } from './types.js';

const full: Catalogue = {
  layers: [
    { id: '0', name: '0', color: '#18181b', visible: true, locked: false },
    { id: 'l1', name: 'A-WALL', color: '#aa0000', visible: true, locked: false, lineWeight: 0.5, lineType: 'dashed', group: 'g1' },
  ],
  layerGroups: [{ id: 'g1', name: 'Architecture', visible: true, locked: false }],
  textStyles: [{ ...DEFAULT_TEXT_STYLE }, { ...DEFAULT_TEXT_STYLE, id: 'big', name: 'Big', height: 5, bold: true, color: '#aa0000' }],
  dimStyles: [{ ...DEFAULT_DIM_STYLE }, { ...DEFAULT_DIM_STYLE, id: 'arch', name: 'Arch', textStyle: 'big', arrow: 'arrow', unit: 'mm', precision: 0 }],
  hatchPatterns: '*MY-LINES, test\n0, 0,0, 0,2\n',
  materials: [{ id: 'm1', name: 'Mineral wool', hatch: 'MY-LINES', hatchScale: 1.5, fill: null, hatchPen: 'light' }, { id: 'm2', name: 'PE foil', membrane: true }],
  annotationTypes: [
    { id: 'a1', name: 'Grid axis', tool: 'axis', textStyle: 'big', layer: 'l1', axis: { bubble: 'square', ends: 'start', size: 0.8, lineType: 'dashed' } },
    { id: 'a2', name: 'Door tag', tool: 'tag', textStyle: 'big', tagField: 'mark' },
    { id: 'a4', name: 'Wall label', tool: 'label', textStyle: 'big', label: { template: '{Name}\n{Qto_WallBaseQuantities.Length:0.00 m|?}', frame: 'bubble', missing: 'field' } },
    { id: 'a3', name: 'Section fill', tool: 'hatch', hatch: { pattern: 'MY-LINES', scale: 2, angle: 45 } },
  ],
  symbols: [{
    id: 's1', name: 'Arrow', unit: 'paper',
    shapes: [{ type: 'polyline', pts: [{ x: 0, y: 0 }, { x: 2, y: 6 }, { x: -2, y: 6 }], closed: true }, { type: 'text', p: { x: 0, y: 8 }, text: 'N', height: 2.5, rotation: 0 }],
  }],
  legends: [{ ...DEFAULT_LEGEND, id: 'lg1', name: 'Plan legend', createdAt: 5, title: 'Key', textStyle: 'big', categories: ['materials', 'symbols'], columns: 2 }],
  cadLayers: [{ id: 'cad1', source: 'CUT', ifcClasses: ['IfcWall'], layer: 'A-WALL-CUT', color: '#7f1d1d', lineWeight: 0.5 }],
  details: [{
    id: 'd1', name: 'Typical parapet', scale: 10,
    drafts: [{ id: 'e1', layerId: 'l1', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 0, y: 0.6 } }, params: {} }],
    layers: [{ id: 'l1', name: 'A-WALL', color: '#aa0000', visible: true, locked: false }], hatchPatterns: '', symbols: [],
  }],
};

describe('catalogue file', () => {
  it('round-trips every kind', () => {
    const back = parseCatalogue(serializeCatalogue(full, 'House', new Date(0)));
    assert.equal(back.name, 'House');
    assert.deepEqual(back.catalogue, full);
  });

  it('does not bring a Standard style the file did not carry', () => {
    const onlyBig: Catalogue = { ...emptyCatalogue(), textStyles: [full.textStyles[1]] };
    assert.deepEqual(parseCatalogue(serializeCatalogue(onlyBig, 'x')).catalogue.textStyles.map((s) => s.id), ['big']);
    assert.deepEqual(parseCatalogue(serializeCatalogue(emptyCatalogue(), 'x')).catalogue, emptyCatalogue());
  });

  it('exports only the chosen kinds and never a legend\'s scope id', () => {
    const picked = selectKinds({ ...full, legends: [{ ...full.legends[0], scope: 'view', scopeId: 'view-7' }] }, new Set(['legends', 'symbols']));
    assert.equal(picked.layers.length, 0);
    assert.equal(picked.symbols.length, 1);
    assert.equal('scopeId' in picked.legends[0], false);
    assert.equal(picked.legends[0].scope, 'view');
  });

  it('refuses a foreign, newer or malformed file with the path', () => {
    const good = JSON.parse(serializeCatalogue(full, 'x'));
    assert.throws(() => parseCatalogue('{nope'), /invalid JSON/);
    assert.throws(() => parseCatalogue(JSON.stringify({ ...good, format: 'ifclite-project' })), /\/format/);
    assert.throws(() => parseCatalogue(JSON.stringify({ ...good, version: 2 })), /newer version/);
    assert.throws(() => parseCatalogue(JSON.stringify({ ...good, annotationTypes: [{ id: 'a', name: 'X', tool: 'laser' }] })), /\/annotationTypes\/0\.tool/);
    assert.throws(() => parseCatalogue(JSON.stringify({ ...good, symbols: [{ id: 's', name: 'S', shapes: [{ type: 'level', p: { x: 0, y: 0 }, value: 1, height: 1 }] }] })), /symbols\/0\.shapes\/0\.type/);
    assert.throws(() => parseCatalogue(JSON.stringify({ ...good, textStyles: [{ id: 5 }] })), /\/textStyles\/0/);
    assert.throws(() => parseCatalogue(JSON.stringify({ ...good, materials: 'wool' })), /\/materials/);
  });
});

let counter = 0;
const fresh = (prefix: string) => `${prefix}-new${++counter}`;

const mine: Catalogue = {
  ...emptyCatalogue(),
  layers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }, { id: 'lm', name: 'a-wall', color: '#0000ff', visible: true, locked: false }],
  textStyles: [{ ...DEFAULT_TEXT_STYLE }, { ...DEFAULT_TEXT_STYLE, id: 'big', name: 'Big', height: 3 }],
  dimStyles: [{ ...DEFAULT_DIM_STYLE }],
  materials: [{ id: 'mm', name: 'mineral  WOOL', hatch: 'INSULATION' }],
  symbols: [{ id: 's1', name: 'Mine', unit: 'paper', shapes: [] }],
};

describe('catalogue merge', () => {
  it('adds what does not clash, whatever the policy, keeping ids that are free and renewing taken ones', () => {
    for (const policy of ['mine', 'theirs', 'both'] as const) {
      const { catalogue, report } = mergeCatalogues(mine, full, policy, fresh);
      assert.ok(catalogue.annotationTypes.some((a) => a.name === 'Door tag'), policy);
      assert.equal(report.annotationTypes.added, 4);
      assert.deepEqual(catalogue.annotationTypes.find((a) => a.name === 'Wall label')?.label, full.annotationTypes.find((a) => a.name === 'Wall label')?.label, `${policy}: the label travels with its type`);
      // 's1' is taken by a different symbol of mine: the incoming Arrow gets a new id.
      const arrow = catalogue.symbols.find((s) => s.name === 'Arrow');
      assert.ok(arrow && arrow.id !== 's1', policy);
      assert.equal(catalogue.symbols.find((s) => s.id === 's1')?.name, 'Mine');
    }
  });

  it('mine: the project keeps its definition, and references land on it', () => {
    const { catalogue, report } = mergeCatalogues(mine, full, 'mine', fresh);
    assert.equal(catalogue.textStyles.find((s) => s.id === 'big')?.height, 3);
    assert.equal(report.textStyles.kept, 2);
    assert.equal(catalogue.layers.find((l) => l.id === 'lm')?.color, '#0000ff');
    const axis = catalogue.annotationTypes.find((a) => a.name === 'Grid axis');
    assert.equal(axis?.textStyle, 'big');
    assert.equal(axis?.layer, 'lm');
    assert.equal(catalogue.materials.find((m) => m.id === 'mm')?.hatch, 'INSULATION');
  });

  it('theirs: the incoming definition replaces the project\'s under the project\'s id', () => {
    const { catalogue, report } = mergeCatalogues(mine, full, 'theirs', fresh);
    const big = catalogue.textStyles.find((s) => s.id === 'big');
    assert.equal(big?.height, 5);
    // Standard says the same in both: no clash.
    assert.deepEqual([report.textStyles.replaced, report.textStyles.kept], [1, 1]);
    assert.equal(catalogue.layers.find((l) => l.id === 'lm')?.color, '#aa0000');
    assert.equal(catalogue.materials.find((m) => m.id === 'mm')?.hatchScale, 1.5);
    assert.equal(catalogue.materials.find((m) => m.id === 'mm')?.name, 'Mineral wool');
    assert.equal(catalogue.layers.length, 2);
  });

  it('both: the incoming one is added under a new name and references follow it', () => {
    const { catalogue, report } = mergeCatalogues(mine, full, 'both', fresh);
    const renamed = catalogue.textStyles.find((s) => s.name === 'Big (2)');
    assert.ok(renamed && renamed.id !== 'big' && renamed.height === 5);
    assert.equal(catalogue.textStyles.find((s) => s.id === 'big')?.height, 3);
    assert.deepEqual([report.textStyles.renamed, report.textStyles.kept], [1, 1]);
    assert.equal(catalogue.textStyles.some((x) => x.name === 'Standard (2)'), false);
    assert.equal(catalogue.dimStyles.find((d) => d.name === 'Arch')?.textStyle, renamed.id);
    assert.equal(catalogue.annotationTypes.find((a) => a.name === 'Grid axis')?.textStyle, renamed.id);
    assert.equal(catalogue.annotationTypes.find((a) => a.name === 'Grid axis')?.layer, catalogue.layers.find((l) => l.name === 'A-WALL (2)')?.id);
    assert.equal(catalogue.legends[0].textStyle, renamed.id);
    // The layer's group came along, and the layer points at it.
    const layer = catalogue.layers.find((l) => l.name === 'A-WALL (2)');
    assert.equal(layer?.group, catalogue.layerGroups[0].id);
  });

  it('both: a clashing hatch pattern is renamed and the materials and types that use it follow', () => {
    const base: Catalogue = { ...emptyCatalogue(), hatchPatterns: '*MY-LINES, mine\n0, 0,0, 0,5\n' };
    const { catalogue } = mergeCatalogues(base, full, 'both', fresh);
    assert.match(catalogue.hatchPatterns, /\*MY-LINES, mine/);
    assert.match(catalogue.hatchPatterns, /\*MY-LINES-2/);
    assert.equal(catalogue.materials.find((m) => m.name === 'Mineral wool')?.hatch, 'MY-LINES-2');
    assert.equal(catalogue.annotationTypes.find((a) => a.name === 'Section fill')?.hatch?.pattern, 'MY-LINES-2');
  });

  it('a clash between definitions that say the same thing is no clash, whatever the policy', () => {
    const twin: Catalogue = { ...emptyCatalogue(), textStyles: [{ ...DEFAULT_TEXT_STYLE, id: 'other-id' }], layers: [{ id: 'other', name: '0', color: '#18181b', visible: true, locked: false }] };
    for (const policy of ['mine', 'theirs', 'both'] as const) {
      const { catalogue, report } = mergeCatalogues(mine, twin, policy, fresh);
      assert.equal(catalogue.textStyles.length, 2, policy);
      assert.equal(catalogue.layers.length, 2, policy);
      assert.deepEqual([report.textStyles.kept, report.textStyles.renamed, report.layers.kept, report.layers.renamed], [1, 0, 1, 0], policy);
    }
  });

  it('never takes a legend\'s scope id from the file', () => {
    const withScope: Catalogue = { ...emptyCatalogue(), legends: [{ ...full.legends[0], scope: 'view', scopeId: 'someone-elses-view' }] };
    const { catalogue } = mergeCatalogues(emptyCatalogue(), withScope, 'mine', fresh);
    assert.equal('scopeId' in catalogue.legends[0], false);
  });

  it('does not change its inputs, and importing the same file twice with mine adds nothing the second time', () => {
    const before = JSON.stringify(mine);
    const once = mergeCatalogues(mine, full, 'mine', fresh).catalogue;
    assert.equal(JSON.stringify(mine), before);
    const twice = mergeCatalogues(once, full, 'mine', fresh);
    assert.deepEqual(twice.catalogue, once);
    assert.equal(Object.values(twice.report).every((r) => r.added === 0), true);
  });
});
