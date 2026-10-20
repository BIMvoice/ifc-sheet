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
import { keepProjectForNewVersion } from './model-version';
import { EMPTY_PROJECT, useProjectStore } from './project-store';

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

  // Review of #137: the host was `refs[0]` even when that model was not loaded, so every loaded model drew halftone.
  it('the host is picked from the loaded models only', () => {
    const versions = [{ key: 'arch-old', name: 'arch-old.ifc' }, { key: 'arch-new', name: 'arch-new.ifc' }, { key: 'str', name: 'str.ifc' }];
    const drawings = modelDrawings(versions, new Set(['arch-new', 'str']));
    assert.deepEqual(drawings.get('arch-new'), { role: 'host', style: 'normal' });
    assert.deepEqual(drawings.get('str'), { role: 'linked', style: 'halftone' });
    const loaded = viewer([{ id: 'N', key: 'arch-new', from: 0, to: 999 }, { id: 'S', key: 'str', from: 1000, to: 1999 }]);
    const styleOf = entityStyles(loaded, versions);
    assert.equal(styleOf?.(48), undefined, 'the loaded architecture draws in full ink');
    assert.equal(styleOf?.(1050), 'halftone');
    // A model marked host that is not loaded hands the role to the first loaded one.
    assert.equal(modelDrawings([{ ...versions[0], role: 'host' }, versions[1], versions[2]], new Set(['arch-new', 'str'])).get('arch-new')?.role, 'host');
    assert.equal(modelDrawings(versions, new Set()).get('arch-old')?.role, 'host', 'none loaded: the list alone decides');
  });

  it('a new version of a model keeps its role and style: by name, else by position', () => {
    try {
      useProjectStore.setState({ models: [{ key: 'a1', name: 'arch.ifc', role: 'linked', drawStyle: 'normal' }, { key: 's1', name: 'str.ifc', role: 'host' }] });
      keepProjectForNewVersion([{ key: 's2', name: 'str.ifc' }, { key: 'a2', name: 'arch.ifc' }]);
      assert.deepEqual(useProjectStore.getState().models, [
        { key: 's2', name: 'str.ifc', role: 'host' },
        { key: 'a2', name: 'arch.ifc', role: 'linked', drawStyle: 'normal' },
      ], 'matched by name, whatever the order');
      useProjectStore.setState({ models: [{ key: 'a1', name: 'arch.ifc', role: 'linked', drawStyle: 'normal' }, { key: 's1', name: 'str.ifc', role: 'host' }] });
      keepProjectForNewVersion([{ key: 'a2', name: 'arch-v2.ifc' }, { key: 's2', name: 'str.ifc' }]);
      assert.deepEqual(useProjectStore.getState().models, [
        { key: 'a2', name: 'arch-v2.ifc', role: 'linked', drawStyle: 'normal' },
        { key: 's2', name: 'str.ifc', role: 'host' },
      ], 'a renamed file takes the role of the model at its position');
    } finally {
      useProjectStore.setState({ models: [], dirty: false });
    }
  });

  it('round-trips through the project file', () => {
    const doc = { ...EMPTY_PROJECT, models: [{ key: 'a', name: 'arch.ifc', role: 'linked' as const, drawStyle: 'normal' as const }, { key: 's', name: 'str.ifc', role: 'host' as const }] };
    assert.deepEqual(parseProjectFile(serializeProject(doc)).models, doc.models);
  });

  // Review of #137: an unknown role (a newer file, a hand edit) made the whole project fail to open.
  it('opens a project with an unknown role or style: the model is linked, its style the default, and a note is logged', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const doc = { ...EMPTY_PROJECT, models: [{ key: 'a', name: 'arch.ifc', role: 'host' as const }, { key: 's', name: 'str.ifc', role: 'linked' as const, drawStyle: 'normal' as const }] };
    const file = JSON.parse(serializeProject(doc));
    file.models[1].role = 'guest';
    file.models[1].drawStyle = 'ghosted';
    const models = parseProjectFile(JSON.stringify(file)).models;
    assert.deepEqual(models, [{ key: 'a', name: 'arch.ifc', role: 'host' }, { key: 's', name: 'str.ifc', role: 'linked' }]);
    assert.deepEqual(modelDrawings(models).get('s'), { role: 'linked', style: 'halftone' });
    const notes = warn.mock.calls.map((c) => String(c.arguments[0]));
    assert.ok(notes.some((n) => n.includes('/models/1.role') && n.includes('guest')), notes.join(' | '));
    assert.ok(notes.some((n) => n.includes('/models/1.drawStyle') && n.includes('ghosted')), notes.join(' | '));
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

  it('a linked model\'s cut hatch goes halftone too, the host\'s stays in full ink', () => {
    const square = (x: number) => ({ outer: [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }], holes: [] });
    const drawing = {
      cutPolygons: [
        { polygon: square(0), entityId: 48, ifcType: 'IfcWall', modelIndex: 0, isCut: true },
        { polygon: square(2), entityId: 1050, ifcType: 'IfcWall', modelIndex: 1, isCut: true },
      ],
      lines: [],
    } as unknown as Drawing2D;
    const graphics = { categories: { walls: { cutHatch: 'LINES45' } } };
    const styleOf = entityStyles(viewer([{ id: 'A', key: 'a', from: 0, to: 999 }, { id: 'S', key: 's', from: 1000, to: 1999 }]), refs);
    const hatches = viewportPens(drawing, graphics, { scale: 1, x: 0, y: 0 }, 'down', [], styleOf).filter((p) => p.layer === 'HATCH');
    assert.deepEqual(hatches.map((p) => p.stroke).sort(), ['#000000', '#999999']);
  });
});
