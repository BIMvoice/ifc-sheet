/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readBCF, writeBCF } from '@ifc-lite/bcf';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { ProjectSheet } from '@/project/types';
import { bcfToComments, commentsToBcf, exportableComments } from './bcf';
import { placeOfElement, targetAtPaper } from './element-at';
import type { ReviewComment } from './types';

/**
 * Comments on a model element as BCF topics, and back (#55). The drawing is a
 * single 2 m x 2 m wall cut on a plan; the sheet shows it at 1:50 with the
 * drawing's middle at the viewport's, so drawing (3, 2) is paper (150, 150).
 */

const GUID = '2O2Fr$t4X7Zf8NOew3FLOH';
const square = [{ x: 2, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 2, y: 3 }];
const drawing = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false } },
  lines: [], projectionPolygons: [],
  cutPolygons: [{ polygon: { outer: square, holes: [] }, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  bounds: { min: { x: 0, y: 0 }, max: { x: 6, y: 4 } },
} as unknown as Drawing2D;
const drawingOf = (id: string) => (id === 'p' ? drawing : null);
const guidOf = (id: number) => (id === 7 ? GUID : null);
const sheet: ProjectSheet = {
  id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape',
  viewports: [{ id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null }],
};
const onElement: ReviewComment = {
  id: 'c1', sheetId: 's', x: 150, y: 150, viewportId: 'vp', viewId: 'p', point: { x: 3, y: 2 }, elementGuid: GUID,
  author: 'Ștefan Țurcanu', createdAt: 1760000000000, status: 'open', text: 'Cotă lipsă la ușă: șapă, țeavă, ăsta',
  replies: [{ id: 'r1', author: 'Ioana Pătrașcu', createdAt: 1760000060000, text: 'Adăugată în plan' }],
};
const onPaper: ReviewComment = { ...onElement, id: 'c2', x: 20, y: 20, elementGuid: undefined, viewportId: undefined, viewId: undefined, point: undefined, text: 'Scara lipsește' };

describe('the element under a pin', () => {
  it('is found at a paper point inside its cut outline, and not beside it', () => {
    const hit = targetAtPaper(sheet, { x: 150, y: 150 }, drawingOf, guidOf);
    assert.equal(hit?.elementGuid, GUID);
    assert.equal(hit?.viewportId, 'vp');
    assert.ok(hit && Math.abs(hit.point.x - 3) < 1e-9 && Math.abs(hit.point.y - 2) < 1e-9, 'the point in the view, metres');
    const beside = targetAtPaper(sheet, { x: 100, y: 120 }, drawingOf, guidOf);
    assert.ok(beside && beside.elementGuid === undefined, 'a point on the drawing, on no element');
    assert.equal(targetAtPaper(sheet, { x: 400, y: 20 }, drawingOf, guidOf), null, 'off every drawing');
  });

  it('is placed on the paper at the middle of its outline', () => {
    const place = placeOfElement(sheet, GUID, drawingOf, guidOf);
    assert.ok(place && Math.abs(place.x - 150) < 1e-9 && Math.abs(place.y - 150) < 1e-9, `${place?.x}, ${place?.y}`);
    assert.equal(placeOfElement(sheet, 'NotOnThisSheet0000000', drawingOf, guidOf), null);
  });
});

describe('comments as BCF', () => {
  it('exports only the comments on a model element, with the element as a component and a viewpoint', async () => {
    assert.deepEqual(exportableComments([onElement, onPaper]).map((c) => c.id), ['c1']);
    const project = commentsToBcf([onElement, onPaper], { sheets: [sheet], drawingOf, projectName: 'Casa' });
    const read = await readBCF(await writeBCF(project));
    assert.equal(read.topics.size, 1);
    const [topic] = [...read.topics.values()];
    assert.equal(topic.description, onElement.text, 'Romanian text exactly');
    assert.equal(topic.creationAuthor, 'Ștefan Țurcanu');
    assert.equal(topic.topicStatus, 'Open');
    assert.deepEqual(topic.comments.map((c) => [c.author, c.comment]), [['Ioana Pătrașcu', 'Adăugată în plan']]);
    assert.deepEqual(topic.viewpoints[0].components?.selection?.map((c) => c.ifcGuid), [GUID]);
    const camera = topic.viewpoints[0].orthogonalCamera;
    assert.ok(camera, 'the viewpoint looks at the pin');
    // A plan looks down (-Z in IFC) at the pin's point: the render frame's (3, 1.2, 2) is IFC (3, -2, 1.2).
    assert.ok(Math.abs(camera.cameraDirection.z + 1) < 1e-9);
    assert.ok(Math.abs(camera.cameraViewPoint.x - 3) < 1e-9 && Math.abs(camera.cameraViewPoint.y + 2) < 1e-9);
  });

  it('exports a comment whose author is unknown', async () => {
    const read = await readBCF(await writeBCF(commentsToBcf([{ ...onElement, author: '', replies: [] }], { sheets: [sheet], drawingOf })));
    assert.equal(read.topics.size, 1);
  });

  it('exports a done comment as Closed', async () => {
    const read = await readBCF(await writeBCF(commentsToBcf([{ ...onElement, status: 'done' }], { sheets: [sheet], drawingOf })));
    assert.equal([...read.topics.values()][0].topicStatus, 'Closed');
  });

  it('reads the topics back as comments on the sheet that shows their element, once', async () => {
    const file = await writeBCF(commentsToBcf([onElement], { sheets: [sheet], drawingOf }));
    let n = 0;
    const opts = { sheets: [sheet], drawingOf, guidOf, newId: () => `new-${++n}` };
    const back = bcfToComments(await readBCF(file), [], opts);
    assert.equal(back.comments.length, 1);
    const c = back.comments[0];
    assert.equal(c.id, 'c1');
    assert.equal(c.sheetId, 's');
    assert.ok(Math.abs(c.x - 150) < 1e-9 && Math.abs(c.y - 150) < 1e-9);
    assert.equal(c.elementGuid, GUID);
    assert.equal(c.text, onElement.text);
    assert.equal(c.author, 'Ștefan Țurcanu');
    assert.deepEqual(c.replies.map((r) => r.text), ['Adăugată în plan']);
    assert.equal(c.status, 'open');
    // The same file again: those comments are here already.
    const again = bcfToComments(await readBCF(file), back.comments, opts);
    assert.deepEqual([again.comments.length, again.known, again.unplaced], [0, 1, 0]);
    // A foreign topic (no label of ours): imported by its element alone.
    const foreignProject = await readBCF(file);
    for (const topic of foreignProject.topics.values()) topic.labels = [];
    const foreign = bcfToComments(foreignProject, back.comments, opts);
    assert.deepEqual([foreign.comments.length, foreign.known], [1, 0]);
    assert.equal(foreign.comments[0].id, 'new-' + n, 'it takes a new id');
  });

  it('leaves out a topic whose element no sheet shows, and counts it', async () => {
    const file = await writeBCF(commentsToBcf([onElement], { sheets: [sheet], drawingOf }));
    const back = bcfToComments(await readBCF(file), [], { sheets: [sheet], drawingOf, guidOf: () => null, newId: () => 'x' });
    assert.deepEqual([back.comments.length, back.unplaced], [0, 1]);
  });
});
