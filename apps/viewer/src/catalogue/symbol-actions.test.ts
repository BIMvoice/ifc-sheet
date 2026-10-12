/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Symbols in the project: made from a selection, the shapes replaced by an
 * instance; redefined, with every instance following; paper symbols keep
 * their size when a view's scale changes; an instance is edited in one step.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setAnnotationScreenUp, entityBounds } from '@/drafting/annotation';
import { newDraft } from '@/drafting/draft-store';
import { rescaleViewAnnotations } from '@/project/drafting-standards';
import { resetProject, useProjectStore } from '@/project/project-store';
import { explodeSymbols, instanceCount, makeSymbolFromEntities, removeSymbol, setSymbolPlacement, setSymbolUnit, symbolInstance } from './symbol-actions.js';

const view = (scale: number) => ({ id: 'v1', name: 'Plan', kind: '3d' as const, viewpoint: null, auto: false, createdAt: 0, scale });

beforeEach(() => {
  resetProject();
  setAnnotationScreenUp(1);
  useProjectStore.setState({ views: [view(100)] });
});

const line = (x1: number, y1: number, x2: number, y2: number) => newDraft('v1', '0', { type: 'line', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });

describe('make a symbol from a selection', () => {
  it('replaces the shapes by one instance of a model-unit symbol that draws the same', () => {
    const a = line(10, 10, 14, 10);
    const b = line(14, 10, 14, 13);
    const ignored = newDraft('v1', '0', { type: 'level', p: { x: 0, y: 0 }, value: 3, height: 0.25 });
    useProjectStore.setState({ drafts: [a, b, ignored] });
    const made = makeSymbolFromEntities('v1', new Set([a.id, b.id, ignored.id]), { x: 10, y: 10 }, 1, 'Corner');
    assert.equal(made?.skipped, 1);
    const s = useProjectStore.getState();
    assert.equal(s.symbols?.length, 1);
    assert.equal(s.symbols?.[0].unit, 'model');
    assert.deepEqual(s.drafts.map((d) => d.shape.type).sort(), ['level', 'symbol']);
    const instance = s.drafts.find((d) => d.shape.type === 'symbol')!;
    assert.deepEqual(entityBounds(instance.shape), { min: { x: 10, y: 10 }, max: { x: 14, y: 13 } });
    assert.equal(instanceCount(s.symbols![0].id), 1);
  });

  it('on a sheet it makes a paper symbol', () => {
    useProjectStore.setState({ sheets: [{ id: 'sh', number: 'A-1', name: 'S', createdAt: 0 }] });
    const l = newDraft('sh', '0', { type: 'line', a: { x: 50, y: 50 }, b: { x: 60, y: 50 } });
    useProjectStore.setState({ drafts: [l] });
    makeSymbolFromEntities('sh', new Set([l.id]), { x: 50, y: 50 }, 1, 'Dash');
    assert.equal(useProjectStore.getState().symbols?.[0].unit, 'paper');
  });

  it('redefining keeps the instances and they follow the new shapes', () => {
    const a = line(0, 0, 2, 0);
    useProjectStore.setState({ drafts: [a] });
    const made = makeSymbolFromEntities('v1', new Set([a.id]), { x: 0, y: 0 }, 1, 'Bar')!;
    const second = symbolInstance('v1', '0', made.id, { x: 20, y: 20 }, 1, 0)!;
    useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, second] });
    assert.equal(instanceCount(made.id), 2);

    const { ids, symbolId } = explodeSymbols(new Set([useProjectStore.getState().drafts[0].id]), 1);
    assert.equal(symbolId, made.id);
    assert.equal(ids.size, 1);
    // Edit the exploded shape (longer), then redefine from it.
    const editedId = [...ids][0];
    useProjectStore.setState({ drafts: useProjectStore.getState().drafts.map((d) => (d.id === editedId ? { ...d, shape: { type: 'line' as const, a: { x: 0, y: 0 }, b: { x: 0, y: 7 } } } : d)) });
    makeSymbolFromEntities('v1', ids, { x: 0, y: 0 }, 1, 'ignored', made.id);
    const s = useProjectStore.getState();
    assert.equal(s.symbols?.length, 1);
    assert.equal(s.symbols?.[0].name, 'Bar');
    assert.equal(instanceCount(made.id), 2);
    const far = s.drafts.find((d) => d.shape.type === 'symbol' && d.shape.p.x === 20)!;
    assert.deepEqual(entityBounds(far.shape), { min: { x: 20, y: 20 }, max: { x: 20, y: 27 } });
  });

  it('nothing a symbol can hold: nothing changes', () => {
    const lvl = newDraft('v1', '0', { type: 'level', p: { x: 0, y: 0 }, value: 3, height: 0.25 });
    useProjectStore.setState({ drafts: [lvl] });
    assert.equal(makeSymbolFromEntities('v1', new Set([lvl.id]), { x: 0, y: 0 }, 1, 'X')?.id, '');
    assert.equal(useProjectStore.getState().symbols?.length, 0);
    assert.equal(useProjectStore.getState().drafts.length, 1);
  });
});

describe('exploding', () => {
  it('turns an instance into its lines and its text, rotated and scaled as placed', () => {
    useProjectStore.setState({ symbols: [{ id: 'n', name: 'N', unit: 'model', shapes: [{ type: 'line', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }, { type: 'text', p: { x: 0, y: 1 }, text: 'N', height: 0.25, rotation: 0 }] }] });
    const inst = symbolInstance('v1', '0', 'n', { x: 5, y: 5 }, 2, 90)!;
    useProjectStore.setState({ drafts: [inst] });
    const { ids } = explodeSymbols(new Set([inst.id]), 1);
    const parts = useProjectStore.getState().drafts;
    assert.equal(ids.size, 2);
    assert.deepEqual(parts.map((d) => d.shape.type).sort(), ['line', 'text']);
    const text = parts.find((d) => d.shape.type === 'text')!.shape;
    assert.ok(text.type === 'text' && text.height === 0.5 && Math.abs(text.p.x - 3) < 1e-9 && Math.abs(text.p.y - 5) < 1e-9);
  });
});

describe('size', () => {
  it('a paper symbol keeps its paper size when the view scale changes; a model symbol keeps its real size', () => {
    useProjectStore.setState({ symbols: [{ id: 'p', name: 'P', unit: 'paper', shapes: [] }, { id: 'm', name: 'M', unit: 'model', shapes: [] }] });
    const paper = symbolInstance('v1', '0', 'p', { x: 0, y: 0 }, 2, 0)!;
    const model = symbolInstance('v1', '0', 'm', { x: 0, y: 0 }, 2, 0)!;
    useProjectStore.setState({ drafts: [paper, model] });
    assert.deepEqual([paper.shape, model.shape].map((s) => s.type === 'symbol' && s.scale), [0.2, 2]);
    useProjectStore.setState({ views: [view(50)] });
    rescaleViewAnnotations('v1');
    const scales = useProjectStore.getState().drafts.map((d) => d.shape.type === 'symbol' && d.shape.scale);
    assert.deepEqual(scales, [0.1, 2]);
  });

  it('changing a symbol\'s unit re-fits its instances', () => {
    useProjectStore.setState({ symbols: [{ id: 'p', name: 'P', unit: 'paper', shapes: [] }] });
    useProjectStore.setState({ drafts: [symbolInstance('v1', '0', 'p', { x: 0, y: 0 }, 1, 0)!] });
    setSymbolUnit('p', 'model');
    const shape = useProjectStore.getState().drafts[0].shape;
    assert.equal(shape.type === 'symbol' && shape.scale, 1);
  });
});

describe('editing an instance', () => {
  it('symbol, factor and rotation change in one step and the size follows the factor', () => {
    useProjectStore.setState({ symbols: [{ id: 'p', name: 'P', unit: 'paper', shapes: [] }, { id: 'q', name: 'Q', unit: 'model', shapes: [] }] });
    const inst = symbolInstance('v1', '0', 'p', { x: 0, y: 0 }, 1, 0)!;
    useProjectStore.setState({ drafts: [inst] });
    setSymbolPlacement(inst.id, { factor: 3, rotationDeg: 90 });
    let d = useProjectStore.getState().drafts[0];
    assert.ok(d.shape.type === 'symbol' && Math.abs(d.shape.scale - 0.3) < 1e-12 && Math.abs(d.shape.rotation - Math.PI / 2) < 1e-12);
    assert.equal(d.params.symbolScale, 3);
    setSymbolPlacement(inst.id, { symbolId: 'q' });
    d = useProjectStore.getState().drafts[0];
    assert.ok(d.shape.type === 'symbol' && d.shape.symbolId === 'q' && d.shape.scale === 3);
  });

  it('deleting a symbol leaves its instances in place', () => {
    useProjectStore.setState({ symbols: [{ id: 'p', name: 'P', unit: 'paper', shapes: [] }] });
    useProjectStore.setState({ drafts: [symbolInstance('v1', '0', 'p', { x: 0, y: 0 }, 1, 0)!] });
    removeSymbol('p');
    assert.equal(useProjectStore.getState().symbols?.length, 0);
    assert.equal(instanceCount('p'), 1);
  });
});
