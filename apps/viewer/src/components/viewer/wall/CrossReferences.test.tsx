/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { createProposedSection } from '@/drafting/section-create';
import { addProjectSheet, resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { ensureDrawingSet, hangView } from '@/project/drawing-set-actions';
import { addViewport, removeViewport, updateSheet, updateViewport } from '@/project/sheets';
import { patchViewDrawing } from '@/project/view-drawings';
import type { SectionProposal } from '@/project/section-proposals';
import type { ProjectSheet } from '@/project/types';
import { WallGrid } from './WallGrid.js';

/**
 * Cross-references on the Wall: a section's mark on the plan says where the
 * section is drawn ("1 / A-301"), the elevation marks round the ground plan say
 * where each elevation is, and both follow a drawing that moves to another
 * sheet or a sheet that is renumbered, without the plan being touched.
 */

/** A 12 x 10 m building, 6 m tall, far from the origin: x 100..112, z 200..210. */
const BOUNDS = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const STOREYS = [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }];
const STAIR: SectionProposal = { key: 'stair-0', label: 'Through the stair', through: 'stair', a: { x: 103, z: 201 }, b: { x: 103, z: 209 }, side: { x: 104, z: 205 } };
/** The ground plan's drawing: the building's footprint, y running down the sheet (north at the top). */
const FOOTPRINT = { min: { x: 100, y: 200 }, max: { x: 112, y: 210 } };

const state = () => useProjectStore.getState();
const sheetNamed = (number: string): ProjectSheet => {
  const s = state().sheets.find((x) => x.number === number);
  assert.ok(s, `sheet ${number}`);
  return s;
};

/** Texts printed on the sheet's SVG, as the Wall draws it. */
function textsOf(ui: HTMLElement, number: string): string[] {
  const svg = ui.querySelector(`svg[data-sheet-id="${sheetNamed(number).id}"]`);
  assert.ok(svg, `${number} is on the wall`);
  return [...svg.querySelectorAll('text')].map((t) => (t.textContent ?? '').trim());
}

function viewNamed(name: string) {
  const v = state().views.find((x) => x.name === name);
  assert.ok(v, name);
  return v;
}

let sectionB = '';

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], STOREYS);
  // The starting set: plans on A-101, elevations on A-201 / A-202, sections A and B on A-301.
  ensureDrawingSet(null, BOUNDS);
  const ground = state().views.find((v) => v.kind === 'plan' && v.level.elevation === 0);
  assert.equal(ground?.kind, 'plan');
  if (ground?.kind !== 'plan') return;
  sectionB = createProposedSection(ground, state().levels, STAIR) ?? '';
  assert.ok(hangView(sectionB, { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } }));
  patchViewDrawing(ground.id, {
    status: 'ready',
    drawing: { lines: [], cutPolygons: [], projectionPolygons: [], bounds: FOOTPRINT, config: { plane: { axis: 'y', position: 1.2, flipped: false } } } as unknown as Drawing2D,
  });
});
afterEach(() => cleanup());

describe('section marks on the Wall', () => {
  it('reads "1 / A-301" on the plan for section A, and "2 / A-301" for B', () => {
    assert.deepEqual(sheetNamed('A-301').viewports?.map((v) => v.viewId), [viewNamed('Section A-A').id, sectionB]);
    const texts = textsOf(render(<WallGrid extent={BOUNDS} onStep={() => {}} />), 'A-101');
    assert.equal(texts.filter((t) => t === '1 / A-301').length, 2, 'the mark at each end of the cut line');
    assert.equal(texts.filter((t) => t === '2 / A-301').length, 2);
  });

  it('follows section A to A-302 without touching the plan', () => {
    const ui = render(<WallGrid extent={BOUNDS} onStep={() => {}} />);
    assert.ok(textsOf(ui, 'A-101').includes('1 / A-301'), 'on the open Wall first');
    const draftsBefore = structuredClone(state().drafts);
    const a = viewNamed('Section A-A').id;
    const from = sheetNamed('A-301');
    // What the Wall does: take the drawing off its sheet, place it on a sheet of its own; the new sheet takes the next number in the sections' series.
    act(() => {
      removeViewport(from.id, from.viewports?.find((v) => v.viewId === a)?.id ?? '');
      addViewport(addProjectSheet('Sections 2'), a, { x: 200, y: 150 }, 50);
    });
    assert.ok(state().sheets.some((s) => s.number === 'A-302' && s.viewports?.[0]?.viewId === a));
    const texts = textsOf(ui, 'A-101');
    assert.equal(texts.filter((t) => t === '1 / A-302').length, 2, `A-101 reads ${texts.join(' | ')}`);
    assert.equal(texts.filter((t) => t === '1 / A-301').length, 2, 'section B is now number 1 on A-301');
    assert.equal(texts.includes('2 / A-301'), false);
    assert.deepEqual(state().drafts, draftsBefore, 'the plan\'s drafts are the same');
  });

  it('keeps the letter alone, and prints no reference, for a section on no sheet', () => {
    const ui = render(<WallGrid extent={BOUNDS} onStep={() => {}} />);
    const a = sheetNamed('A-301').viewports?.find((v) => v.viewId === viewNamed('Section A-A').id);
    act(() => removeViewport(sheetNamed('A-301').id, a?.id ?? ''));
    const texts = textsOf(ui, 'A-101');
    assert.equal(texts.filter((t) => t === '1 / A-301').length, 2, 'section B is now the first drawing on A-301');
    assert.equal(texts.filter((t) => t === 'A').length, 2, 'section A keeps its letter');
    assert.equal(texts.filter((t) => t.endsWith('A-301')).length, 2, 'and nothing names a sheet for it');
  });

  it('updates every mark when the sheet is renumbered', () => {
    const ui = render(<WallGrid extent={BOUNDS} onStep={() => {}} />);
    assert.equal(textsOf(ui, 'A-101').filter((t) => t.endsWith('/ A-301')).length, 4);
    act(() => updateSheet(sheetNamed('A-301').id, { number: 'S-01' }));
    const texts = textsOf(ui, 'A-101');
    assert.equal(texts.filter((t) => t === '1 / S-01').length, 2);
    assert.equal(texts.filter((t) => t === '2 / S-01').length, 2);
    assert.equal(texts.some((t) => t.includes('A-301')), false);
  });

  it('prints a drawing number a person chose', () => {
    const sheet = sheetNamed('A-301');
    updateViewport(sheet.id, sheet.viewports?.[0].id ?? '', { drawingNumber: '7' });
    const texts = textsOf(render(<WallGrid extent={BOUNDS} onStep={() => {}} />), 'A-101');
    assert.equal(texts.filter((t) => t === '7 / A-301').length, 2);
  });
});

describe('drawing numbers in the titles of a sheet', () => {
  it('print 1 and 2 in reading order beside each title, and a chosen number replaces one', () => {
    assert.deepEqual(textsOf(render(<WallGrid extent={BOUNDS} onStep={() => {}} />), 'A-101').filter((t) => /^\d$/.test(t)), ['1', '2']);
    cleanup();
    const sheet = sheetNamed('A-101');
    updateViewport(sheet.id, sheet.viewports?.[1].id ?? '', { drawingNumber: '9' });
    assert.deepEqual(textsOf(render(<WallGrid extent={BOUNDS} onStep={() => {}} />), 'A-101').filter((t) => /^\d$/.test(t)), ['1', '9']);
  });
});

describe('elevation marks on the ground plan', () => {
  const marks = (texts: string[]) => texts.filter((t) => /^\d+ \/ A-20\d$/.test(t));

  it('has one for each elevation on a sheet, naming its drawing and its sheet', () => {
    const texts = textsOf(render(<WallGrid extent={BOUNDS} onStep={() => {}} />), 'A-101');
    // A-201 holds south then north, A-202 east then west.
    assert.deepEqual(marks(texts).sort(), ['1 / A-201', '1 / A-202', '2 / A-201', '2 / A-202']);
  });

  it('are made at draw time: none is stored in the project', () => {
    render(<WallGrid extent={BOUNDS} onStep={() => {}} />);
    assert.equal(state().drafts.some((d) => d.id.includes('~xref')), false);
  });
});
