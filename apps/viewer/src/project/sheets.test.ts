/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheets: paper sizes, viewports placed / moved / removed, boxes that fit
 * the drawing until sized by hand, and the layout surviving a project file.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withoutAutoNumber } from './sheet-numbers.js';
import { syncProjectWithModels } from './project-store.js';
import { addProjectSheet, projectDocument, resetProject, setSheetNumber, useProjectStore } from './project-store.js';
import { addViewport, mmPerMetre, paperOf, removeViewport, SHEET_SCALES, sheetsShowing, updateSheet, updateViewport, viewportBox } from './sheets.js';
import { PAPER_MM } from './paper.js';
import { parseProjectFile, serializeProject } from './project-file.js';

beforeEach(() => resetProject());

const sheet = () => useProjectStore.getState().sheets[0];

describe('sheet numbers follow what the sheet holds', () => {
  const viewOf = (kind: string) => {
    const v = useProjectStore.getState().views.find((x) => x.kind === kind);
    if (!v) throw new Error(kind);
    return v.id;
  };
  beforeEach(() => syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }]));
  const numbers = () => useProjectStore.getState().sheets.map((s) => s.number);

  it('an empty sheet is numbered as a plan sheet, and takes the elevation series when an elevation is placed', () => {
    const id = addProjectSheet('Facades');
    assert.deepEqual(numbers(), ['A-101']);
    addViewport(id, viewOf('elevation'), { x: 100, y: 100 });
    assert.deepEqual(numbers(), ['A-201']);
    // Placed once: a second view does not renumber it.
    addViewport(id, viewOf('plan'), { x: 200, y: 100 });
    assert.deepEqual(numbers(), ['A-201']);
    assert.equal(sheet().autoNumber, undefined);
  });

  it('the next sheet of elevations takes the next free number', () => {
    const a = addProjectSheet('A');
    const b = addProjectSheet('B');
    addViewport(a, viewOf('elevation'), { x: 100, y: 100 });
    addViewport(b, viewOf('elevation'), { x: 100, y: 100 });
    assert.deepEqual(numbers(), ['A-201', 'A-202']);
  });

  it('a number typed by hand is never replaced', () => {
    const id = addProjectSheet('Mine');
    setSheetNumber(id, 'X-7');
    addViewport(id, viewOf('elevation'), { x: 100, y: 100 });
    assert.deepEqual(numbers(), ['X-7']);
  });

  it('a sheet from an older file, which has no flag, keeps its number', () => {
    const id = addProjectSheet('Old');
    useProjectStore.setState((s) => ({ sheets: s.sheets.map((x) => withoutAutoNumber(x)) }));
    addViewport(id, viewOf('elevation'), { x: 100, y: 100 });
    assert.deepEqual(numbers(), ['A-101']);
  });

  it('the flag is saved and comes back', () => {
    addProjectSheet('Empty');
    const back = parseProjectFile(serializeProject(projectDocument()));
    assert.equal(back.sheets[0].autoNumber, true);
  });
});

describe('sheets', () => {
  it('sizes the paper by format and orientation (A1 landscape by default)', () => {
    addProjectSheet('Plans');
    assert.deepEqual(paperOf(sheet()), { w: 841, h: 594 });
    updateSheet(sheet().id, { paper: 'A3', orientation: 'portrait' });
    assert.deepEqual(paperOf(sheet()), { w: 297, h: 420 });
  });

  it('every paper is the ISO A size in millimetres, long side first in landscape', () => {
    const iso = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] } as const;
    for (const [paper, [long, short]] of Object.entries(iso)) {
      assert.deepEqual(PAPER_MM[paper as keyof typeof iso], { w: long, h: short }, paper);
      assert.deepEqual(paperOf({ id: 's', number: '1', name: 'n', createdAt: 0, paper: paper as keyof typeof iso, orientation: 'portrait' }), { w: short, h: long }, paper);
    }
  });

  it('a length in metres is 1000 / scale millimetres on paper, at every offered scale', () => {
    assert.equal(5 * mmPerMetre({ scale: 100 }), 50);
    assert.equal(5 * mmPerMetre({ scale: 50 }), 100);
    for (const scale of SHEET_SCALES) assert.ok(Math.abs(mmPerMetre({ scale }) * scale - 1000) < 1e-9, `1:${scale}`);
  });

  it('places, moves, rescales and removes viewports', () => {
    addProjectSheet('Plans');
    const id = addViewport(sheet().id, 'view-1', { x: 200, y: 150 }, 100);
    updateViewport(sheet().id, id, { x: 250, scale: 50 });
    assert.deepEqual({ ...sheet().viewports?.[0] }, { id, viewId: 'view-1', x: 250, y: 150, scale: 50, width: 0, height: 0, center: null });
    assert.equal(sheetsShowing('view-1').length, 1);
    removeViewport(sheet().id, id);
    assert.equal(sheet().viewports?.length, 0);
  });

  it('fits the viewport box to the drawing until it is sized by hand', () => {
    addProjectSheet('Plans');
    const id = addViewport(sheet().id, 'v', { x: 0, y: 0 }, 100);
    const bounds = { min: { x: 0, y: 0 }, max: { x: 20, y: 10 } };
    // 20 m × 10 m at 1:100 is 200 × 100 mm, plus a 10 mm margin each side.
    assert.deepEqual(viewportBox(sheet().viewports![0], bounds), { width: 220, height: 120 });
    updateViewport(sheet().id, id, { width: 150, height: 90 });
    assert.deepEqual(viewportBox(sheet().viewports![0], bounds), { width: 150, height: 90 });
  });

  it('keeps paper, title block and viewports through the project file', () => {
    addProjectSheet('Plans');
    updateSheet(sheet().id, { paper: 'A2', titleBlock: { drawnBy: 'IC' } });
    addViewport(sheet().id, 'view-1', { x: 100, y: 100 }, 200);
    const back = parseProjectFile(serializeProject(projectDocument())).sheets[0];
    assert.equal(back.paper, 'A2');
    assert.equal(back.titleBlock?.drawnBy, 'IC');
    assert.equal(back.viewports?.[0].scale, 200);
  });
});
