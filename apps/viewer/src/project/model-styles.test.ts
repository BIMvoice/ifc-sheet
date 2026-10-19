/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which model is the host and how each model draws (#96): the first model is
 * the host unless one is marked, linked models default to halftone, the
 * setting survives the project file, and a single loaded model draws exactly
 * as before (no style resolver at all).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { viewportPens } from '@/components/viewer/sheets/viewport-pens';
import { entityStyles, halftoneColor, modelDrawings, type LoadedModelsView } from './model-styles';
import { parseProjectFile, serializeProject } from './project-file';
import { EMPTY_PROJECT } from './project-store';

const refs = [{ key: 'a', name: 'arch.ifc' }, { key: 's', name: 'str.ifc' }, { key: 'm', name: 'mep.ifc' }];

function viewer(models: Array<{ id: string; key: string; from: number; to: number }>): LoadedModelsView {
  return {
    models: new Map(models.map((m) => [m.id, { id: m.id, name: m.key }])),
    resolveGlobalIdFromModels: (globalId) => {
      const owner = models.find((m) => globalId >= m.from && globalId <= m.to);
      return owner ? { modelId: owner.id } : null;
    },
  };
}

describe('model roles and styles', () => {
  it('the first model is the host, every other linked and halftone', () => {
    assert.deepEqual([...modelDrawings(refs)], [
      ['a', { role: 'host', style: 'normal' }], ['s', { role: 'linked', style: 'halftone' }], ['m', { role: 'linked', style: 'halftone' }],
    ]);
  });

  it('a model marked host is the host wherever it is in the list; explicit styles win', () => {
    const drawings = modelDrawings([refs[0], { ...refs[1], role: 'host' }, { ...refs[2], drawStyle: 'normal' }]);
    assert.deepEqual(drawings.get('a'), { role: 'linked', style: 'halftone' });
    assert.deepEqual(drawings.get('s'), { role: 'host', style: 'normal' });
    assert.deepEqual(drawings.get('m'), { role: 'linked', style: 'normal' });
  });

  it('round-trips through the project file, and refuses an unknown role', () => {
    const doc = { ...EMPTY_PROJECT, models: [{ key: 'a', name: 'arch.ifc', role: 'linked' as const, drawStyle: 'normal' as const }, { key: 's', name: 'str.ifc', role: 'host' as const }] };
    assert.deepEqual(parseProjectFile(serializeProject(doc)).models, doc.models);
    const bad = JSON.parse(serializeProject(doc));
    bad.models[0].role = 'guest';
    assert.throws(() => parseProjectFile(JSON.stringify(bad)), /role/);
  });

  it('halftone mixes a pen toward white and keeps its hue', () => {
    assert.equal(halftoneColor('#000000'), '#999999');
    assert.equal(halftoneColor('#ff0000'), '#ff9999');
    assert.equal(halftoneColor('#ffffff'), '#ffffff');
  });

  it('resolves each drawing entity to its model\'s style; one loaded model has no resolver', () => {
    const two = viewer([{ id: 'A', key: 'a', from: 0, to: 999 }, { id: 'S', key: 's', from: 1000, to: 1999 }]);
    const styleOf = entityStyles(two, refs);
    assert.equal(styleOf?.(48), undefined);
    assert.equal(styleOf?.(1050), 'halftone');
    assert.equal(styleOf?.(5000), undefined, 'an id no model owns draws normally');
    assert.equal(entityStyles(viewer([{ id: 'S', key: 's', from: 0, to: 999 }]), refs), undefined, 'a single model, even a linked one, draws as before');
  });

  it('without a resolver the pens are exactly the category pens', () => {
    const drawing = {
      cutPolygons: [{ polygon: { outer: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], holes: [] }, entityId: 1050, ifcType: 'IfcColumn', modelIndex: 1, isCut: true }],
      lines: [{ line: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, category: 'cut', visibility: 'visible', entityId: 1050, ifcType: 'IfcColumn', modelIndex: 1, depth: 0 }],
    } as unknown as Drawing2D;
    const t = { scale: 1, x: 0, y: 0 };
    const plain = viewportPens(drawing, undefined, t, 'down', []);
    assert.deepEqual(plain.map((p) => p.stroke ?? p.fill), ['#d4d4d8', '#000000']);
    const styleOf = entityStyles(viewer([{ id: 'A', key: 'a', from: 0, to: 999 }, { id: 'S', key: 's', from: 1000, to: 1999 }]), refs);
    assert.deepEqual(viewportPens(drawing, undefined, t, 'down', [], styleOf).map((p) => p.stroke ?? p.fill), ['#eeeeef', '#999999']);
    assert.deepEqual(viewportPens(drawing, undefined, t, 'down', [], styleOf).map((p) => [p.width, p.layer]), plain.map((p) => [p.width, p.layer]));
  });
});
