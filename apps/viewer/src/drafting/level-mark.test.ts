/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Parametric level marks: the number comes from the reference (the measured
 * point, and on a plan the storey), the symbol can sit away from it, and the
 * marks of one section line up on a picked vertical line.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, newDraft } from './draft-store.js';
import { readDraft } from '@bimvoice/ifcsheet';
import { mirrorEntity, rotateEntity, translateEntity } from './annotation.js';
import { gripAt, gripsOf, moveGrip } from './grips.js';
import {
  alignLevelMarks, followReference, isManualLevel, levelValueOf, moveReference, placeSymbol, setLevelValue, settleLevel, witnessLine, type LevelRef, type LevelShape,
} from './level-mark.js';
import { syncLevelMarks } from './level-sync.js';
import {
  attachDraftingView, cancelCommand, clickDrawing, pressEnter, setAnnotationProviders, setLevelReferenceProviders, setDraftSelection,
  startDraftCommand, useDraftingSession,
} from './session.js';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const TOL = 0.05;
/** A section: the drawing's y is the height in metres. */
const heightOf = (r: LevelRef): number | null => r.at.y;
const section = (p: { x: number; y: number }, at: { x: number; y: number }, value = at.y): LevelShape => ({ type: 'level', p, value, height: 0.25, ref: { at } });
const plan = (p: { x: number; y: number }, at: { x: number; y: number }, value = 3): LevelShape => ({ type: 'level', p, value, height: 0.25, ref: { at, storey: 'storey-1' } });
const levels: Record<string, number> = { 'storey-1': 3, 'storey-2': 6 };
const storeyHeight = (r: LevelRef): number | null => (r.storey ? levels[r.storey] ?? null : null);
const levelsOnView = (): LevelShape[] => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'level' ? [d.shape] : []));

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  setAnnotationProviders(() => [], (p) => p.y);
  setLevelReferenceProviders((p) => ({ at: p }), (r) => r.at.y);
});

describe('the value comes from the reference', () => {
  it('a section mark reads the height of its reference, not the number cached at placement', () => {
    const mark = section({ x: 5, y: 2 }, { x: 0, y: 2 }, 99);
    assert.equal(levelValueOf(mark, heightOf), 2);
    assert.equal(settleLevel(mark, heightOf).value, 2);
  });

  it('a plan mark reads the storey it was placed on', () => {
    const mark = plan({ x: 1, y: 1 }, { x: 0, y: 0 }, 0);
    assert.equal(levelValueOf(mark, storeyHeight), 3);
    // The storey is raised in the project: the mark follows.
    levels['storey-1'] = 3.5;
    assert.equal(levelValueOf(mark, storeyHeight), 3.5);
    levels['storey-1'] = 3;
  });

  it('keeps the last number when the reference cannot be resolved any more', () => {
    const mark = plan({ x: 1, y: 1 }, { x: 0, y: 0 }, 3);
    assert.equal(levelValueOf({ ...mark, ref: { at: { x: 0, y: 0 }, storey: 'gone' } }, storeyHeight), 3);
  });

  it('a mark without a reference (an old file) keeps its typed value', () => {
    assert.equal(levelValueOf({ type: 'level', p: { x: 0, y: 0 }, value: 7, height: 0.25 }, heightOf), 7);
  });

  it('LEVEL places a mark that remembers where it measured', () => {
    startDraftCommand('level');
    clickDrawing({ x: 2, y: 4.5 }, TOL, false);
    pressEnter();
    const [mark] = levelsOnView();
    assert.deepEqual(mark.ref, { at: { x: 2, y: 4.5 } });
    assert.equal(mark.value, 4.5);
    assert.deepEqual(mark.p, { x: 2, y: 4.5 });
  });

  it('LEVEL on a plan records the storey the plan reads', () => {
    setLevelReferenceProviders((p) => ({ at: p, storey: 'storey-2' }), storeyHeight);
    startDraftCommand('level');
    clickDrawing({ x: 2, y: 4.5 }, TOL, false);
    pressEnter();
    const [mark] = levelsOnView();
    assert.equal(mark.ref?.storey, 'storey-2');
    assert.equal(mark.value, 6);
  });
});

describe('the symbol and its reference', () => {
  it('on a section the symbol slides along the horizontal and stays at the reference height', () => {
    const mark = section({ x: 0, y: 2 }, { x: 0, y: 2 });
    const moved = placeSymbol(mark, { x: 8, y: 5 });
    assert.deepEqual(moved.p, { x: 8, y: 2 });
    assert.equal(moved.value, 2, 'moving the symbol never changes the number');
    assert.deepEqual(moved.ref, mark.ref);
  });

  it('on a plan the symbol goes anywhere', () => {
    assert.deepEqual(placeSymbol(plan({ x: 0, y: 0 }, { x: 0, y: 0 }), { x: 8, y: 5 }).p, { x: 8, y: 5 });
  });

  it('dragging the symbol grip keeps the height, dragging the reference grip changes the number', () => {
    const mark = section({ x: 4, y: 2 }, { x: 0, y: 2 });
    assert.deepEqual(gripsOf('a', mark).map((g) => g.key), ['p', 'ref']);
    const slid = moveGrip(mark, 'p', { x: 9, y: 7 }, heightOf);
    assert.ok(slid.type === 'level' && slid.p.y === 2 && slid.value === 2);
    const lifted = moveGrip(mark, 'ref', { x: 0, y: 3.5 }, heightOf);
    assert.ok(lifted.type === 'level');
    if (lifted.type !== 'level') return;
    assert.equal(lifted.value, 3.5, 'the number follows the reference');
    assert.equal(lifted.p.y, 3.5, 'the symbol rides along to the new height');
    assert.equal(lifted.p.x, 4, 'and keeps its place on the horizontal');
  });

  it('on a plan the reference grip moves the measured point and leaves the symbol and storey', () => {
    const mark = plan({ x: 4, y: 4 }, { x: 0, y: 0 });
    const out = moveReference(mark, { x: 1, y: 2 }, storeyHeight);
    assert.deepEqual(out.ref, { at: { x: 1, y: 2 }, storey: 'storey-1' });
    assert.deepEqual(out.p, mark.p);
    assert.equal(out.value, 3);
  });

  it('where symbol and reference coincide the symbol grip is the one picked', () => {
    const grips = gripsOf('a', section({ x: 4, y: 2 }, { x: 4, y: 2 }));
    assert.equal(gripAt(grips, { x: 4, y: 2 }, 0.1)?.key, 'p');
    const apart = gripsOf('a', section({ x: 6, y: 2 }, { x: 4, y: 2 }));
    assert.equal(gripAt(apart, { x: 4.01, y: 2 }, 0.1)?.key, 'ref');
  });

  it('a mark with no reference has one grip', () => {
    assert.deepEqual(gripsOf('a', { type: 'level', p: { x: 0, y: 0 }, value: 1, height: 0.25 }).map((g) => g.key), ['p']);
  });

  it('shows a witness line only while symbol and reference are apart', () => {
    assert.equal(witnessLine(section({ x: 0, y: 2 }, { x: 0, y: 2 })), null);
    assert.deepEqual(witnessLine(section({ x: 6, y: 2 }, { x: 0, y: 2 })), { a: { x: 0, y: 2 }, b: { x: 6, y: 2 } });
    assert.equal(witnessLine({ type: 'level', p: { x: 6, y: 2 }, value: 1, height: 0.25 }), null);
  });
});

describe('a typed number', () => {
  it('replaces the derived one, drops the reference and leaves the symbol', () => {
    const typed = setLevelValue(section({ x: 6, y: 2 }, { x: 0, y: 2 }), 7.5);
    assert.equal(typed.value, 7.5);
    assert.equal(typed.ref, undefined);
    assert.deepEqual(typed.p, { x: 6, y: 2 });
    assert.equal(isManualLevel(typed), true);
    assert.equal(levelValueOf(typed, heightOf), 7.5, 'nothing derives it any more');
  });

  it('can be taken back to the model: the symbol point is measured again, on a plan with its storey', () => {
    const typed = setLevelValue(section({ x: 6, y: 2 }, { x: 0, y: 2 }), 7.5);
    const back = followReference(typed, (p) => ({ at: p }), heightOf);
    assert.deepEqual(back.ref, { at: { x: 6, y: 2 } });
    assert.equal(back.value, 2);
    const onPlan = followReference(setLevelValue(plan({ x: 1, y: 1 }, { x: 0, y: 0 }), 9), (p) => ({ at: p, storey: 'storey-2' }), storeyHeight);
    assert.deepEqual(onPlan.ref, { at: { x: 1, y: 1 }, storey: 'storey-2' });
    assert.equal(onPlan.value, 6);
  });
});

describe('move, copy, mirror and rotate', () => {
  const mark = section({ x: 0, y: 2 }, { x: 0, y: 2 });

  it('move and copy carry the symbol sideways and leave the reference where it measured', () => {
    const out = translateEntity(mark, { x: 5, y: 3 });
    assert.ok(out.type === 'level');
    if (out.type !== 'level') return;
    assert.deepEqual(out.ref, mark.ref, 'the reference is untouched');
    assert.deepEqual(out.p, { x: 5, y: 2 }, 'the symbol slides, it does not leave the reference height');
    assert.equal(out.value, 2);
  });

  it('mirror places the symbol across the axis and keeps reference and number', () => {
    const out = mirrorEntity(section({ x: 4, y: 2 }, { x: 0, y: 2 }), { x: 10, y: 0 }, { x: 10, y: 1 });
    assert.ok(out.type === 'level');
    if (out.type !== 'level') return;
    assert.deepEqual(out.p, { x: 16, y: 2 });
    assert.deepEqual(out.ref, { at: { x: 0, y: 2 } });
    assert.equal(out.value, 2);
  });

  it('rotate keeps the symbol on the reference height and the reference where it was', () => {
    const out = rotateEntity(section({ x: 4, y: 2 }, { x: 0, y: 2 }), { x: 0, y: 0 }, Math.PI / 2);
    assert.ok(out.type === 'level');
    if (out.type !== 'level') return;
    assert.deepEqual(out.ref, { at: { x: 0, y: 2 } });
    near(out.p.y, 2);
    assert.equal(out.value, 2);
  });

  it('on a plan the symbol moves freely and the reference stays', () => {
    const out = translateEntity(plan({ x: 0, y: 0 }, { x: 0, y: 0 }), { x: 5, y: 3 });
    assert.ok(out.type === 'level');
    if (out.type !== 'level') return;
    assert.deepEqual(out.p, { x: 5, y: 3 });
    assert.deepEqual(out.ref, { at: { x: 0, y: 0 }, storey: 'storey-1' });
  });

  it('an old mark without a reference moves wholly, as before', () => {
    const old: LevelShape = { type: 'level', p: { x: 0, y: 2 }, value: 2, height: 0.25 };
    assert.deepEqual(translateEntity(old, { x: 5, y: 3 }), { type: 'level', p: { x: 5, y: 5 }, value: 2, height: 0.25 });
  });
});

describe('align', () => {
  it('stacks the symbols on one vertical line, each at its own height, references untouched', () => {
    const a = section({ x: 1, y: 2 }, { x: 1, y: 2 });
    const b = section({ x: 9, y: 5 }, { x: 3, y: 5 });
    const out = alignLevelMarks([a, b], 12);
    assert.deepEqual(out.map((m) => m.p), [{ x: 12, y: 2 }, { x: 12, y: 5 }]);
    assert.deepEqual(out.map((m) => m.ref), [a.ref, b.ref]);
    assert.deepEqual(out.map((m) => m.value), [2, 5]);
  });

  it('LEVELALIGN lines the selected marks up on the picked line and ignores other entities', () => {
    const a = newDraft('view-1', '0', section({ x: 1, y: 2 }, { x: 1, y: 2 }));
    const b = newDraft('view-1', '0', section({ x: 9, y: 5 }, { x: 3, y: 5 }));
    const line = newDraft('view-1', '0', { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } });
    useProjectStore.setState({ drafts: [a, b, line] });
    setDraftSelection(new Set([a.id, b.id, line.id]));
    startDraftCommand('levelalign');
    clickDrawing({ x: 12, y: 40 }, TOL, false);
    const after = useProjectStore.getState().drafts;
    assert.deepEqual(after.map((d) => d.shape.type === 'level' ? d.shape.p : null), [{ x: 12, y: 2 }, { x: 12, y: 5 }, null]);
    assert.deepEqual(after[2].shape, line.shape, 'the line is not touched');
  });
});

describe('keeping the number current', () => {
  it('re-derives marks of a view when what they read from changes, without a history step', () => {
    const mark = newDraft('view-1', '0', plan({ x: 1, y: 1 }, { x: 0, y: 0 }, 3));
    const other = newDraft('view-2', '0', plan({ x: 1, y: 1 }, { x: 0, y: 0 }, 3));
    useProjectStore.setState({ drafts: [mark, other] });
    levels['storey-1'] = 3.4;
    syncLevelMarks('view-1', storeyHeight);
    levels['storey-1'] = 3;
    const [a, b] = useProjectStore.getState().drafts;
    assert.ok(a.shape.type === 'level' && a.shape.value === 3.4);
    assert.ok(b.shape.type === 'level' && b.shape.value === 3, 'another view is not touched');
  });
});

describe('project files', () => {
  it('reads a mark written before references existed', () => {
    const old = { id: 'd1', viewId: 'v', layerId: '0', shape: { type: 'level', p: { x: 1, y: 2 }, value: 3.06, height: 0.25 }, params: {} };
    assert.deepEqual(readDraft(old, 'drafts/0').shape, { type: 'level', p: { x: 1, y: 2 }, value: 3.06, height: 0.25 });
  });

  it('round-trips the reference', () => {
    const shape = plan({ x: 1, y: 2 }, { x: 0, y: 0 });
    const entity = { id: 'd1', viewId: 'v', layerId: '0', shape, params: {} };
    assert.deepEqual(readDraft(JSON.parse(JSON.stringify(entity)), 'drafts/0').shape, shape);
    const bare = section({ x: 1, y: 2 }, { x: 0, y: 2 });
    assert.deepEqual(readDraft(JSON.parse(JSON.stringify({ ...entity, shape: bare })), 'drafts/0').shape, bare);
  });

  it('refuses a malformed reference with its path', () => {
    const bad = { id: 'd1', viewId: 'v', layerId: '0', shape: { type: 'level', p: { x: 1, y: 2 }, value: 3, height: 0.25, ref: { at: 'nowhere' } }, params: {} };
    assert.throws(() => readDraft(bad, 'drafts/0'), /drafts\/0\.shape\.ref\.at/);
    const badStorey = { ...bad, shape: { ...bad.shape, ref: { at: { x: 0, y: 0 }, storey: 4 } } };
    assert.throws(() => readDraft(badStorey, 'drafts/0'), /ref\.storey/);
  });
});
