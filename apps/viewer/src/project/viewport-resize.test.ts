/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #139: the frame maths of a hand resize, and that a resized viewport comes
 * back from the project file with its size and the drawing in the same place.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { buildPackage, readPackage, unzipPackage, zipPackage } from './package/package-io.js';
import { isResizable, resizedFrame, sheetDrawingArea } from './viewport-resize.js';
import { updateViewport } from './sheets.js';
import type { ProjectSheet, ProjectView, SheetViewport } from './types.js';

const area = { x: 10, y: 10, w: 574, h: 350 };
const vp: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null };

describe('resizedFrame', () => {
  /** Where drawing point `p` lands on the paper for a frame, given the drawing → paper anchor. */
  const paperX = (frame: { x: number; center: { x: number } }, p: number, anchor: number, sign: number, scale: number) => frame.x + (p - frame.center.x) * sign * (1000 / scale);

  it('keeps every drawing point where it was on the paper, for every handle and every axis flip', () => {
    const anchor = { x: 150, y: 150 };
    for (const signs of [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }]) {
      for (const handle of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const) {
        const f = resizedFrame(vp, { width: 120, height: 80 }, handle, { x: 130, y: 120 }, area, anchor, signs);
        const mm = 1000 / vp.scale;
        // The transform x = frame.x - centre.x * sign * mm must equal the anchor it started with.
        assert.ok(Math.abs(f.x - f.center.x * signs.x * mm - anchor.x) < 1e-9, `${handle} x ${signs.x}`);
        assert.ok(Math.abs(f.y - f.center.y * signs.y * mm - anchor.y) < 1e-9, `${handle} y ${signs.y}`);
        assert.ok(Number.isInteger(f.width) && Number.isInteger(f.height), `${handle} whole mm`);
      }
    }
    assert.equal(paperX({ x: 1, center: { x: 0 } }, 0, 0, 1, 50), 1);
  });

  it('moves one edge for an edge handle and two for a corner, the opposite ones staying where they are', () => {
    const edges = (f: { x: number; y: number; width: number; height: number }) => [f.x - f.width / 2, f.x + f.width / 2, f.y - f.height / 2, f.y + f.height / 2];
    const base = edges({ x: 150, y: 150, width: 120, height: 80 });
    const was = (h: Parameters<typeof resizedFrame>[2], to = { x: 200, y: 170 }) => edges(resizedFrame(vp, { width: 120, height: 80 }, h, to, area, { x: 0, y: 0 }, { x: 1, y: 1 }));
    assert.deepEqual(was('e'), [base[0], 200, base[2], base[3]]);
    assert.deepEqual(was('n'), [base[0], base[1], 170, base[3]]);
    assert.deepEqual(was('sw', { x: 100, y: 170 }), [100, base[1], base[2], 170]);
  });

  it('stops at the drawing area and at the minimum size', () => {
    const f = resizedFrame(vp, { width: 120, height: 80 }, 'se', { x: 9999, y: 9999 }, area, { x: 0, y: 0 }, { x: 1, y: 1 });
    assert.deepEqual([f.x + f.width / 2, f.y + f.height / 2], [584, 360]);
    const g = resizedFrame(vp, { width: 120, height: 80 }, 'nw', { x: 9999, y: 9999 }, area, { x: 0, y: 0 }, { x: 1, y: 1 });
    assert.deepEqual([g.width, g.height], [20, 15]);
  });

  it('takes the area from the sheet\'s own paper: the frame inside, the title block out', () => {
    const sheet = { id: 's', number: 'A-1', name: 'x', createdAt: 0, paper: 'A3', orientation: 'portrait' } as ProjectSheet;
    assert.deepEqual(sheetDrawingArea(sheet), { x: 10, y: 10, w: 277, h: 420 - 20 - 50 });
  });

  it('takes the area from the sheet\'s own frame: a title block strip at the right, and custom margins', () => {
    const base = { id: 's', number: 'A-1', name: 'x', createdAt: 0, paper: 'A3', orientation: 'landscape' } as ProjectSheet;
    // A3 landscape is 420 x 297. A strip takes 50 off the right of the frame, not off the bottom.
    const strip: ProjectSheet = { ...base, frame: { margins: { top: 20, right: 10, bottom: 10, left: 25 }, titleBlock: 'right' } };
    assert.deepEqual(sheetDrawingArea(strip), { x: 25, y: 20, w: 335, h: 267 });
    const custom: ProjectSheet = { ...base, frame: { margins: { top: 15, right: 30, bottom: 5, left: 40 }, titleBlock: 'bottom-right' } };
    assert.deepEqual(sheetDrawingArea(custom), { x: 40, y: 15, w: 350, h: 227 });
    // The clamp a drag runs into is that area, on every side.
    const centred = { ...vp, x: 200, y: 150 };
    const se = resizedFrame(centred, { width: 100, height: 80 }, 'se', { x: 9999, y: 9999 }, sheetDrawingArea(strip), { x: 0, y: 0 }, { x: 1, y: 1 });
    assert.deepEqual([se.x + se.width / 2, se.y + se.height / 2], [360, 287]);
    const nw = resizedFrame(centred, { width: 100, height: 80 }, 'nw', { x: -9999, y: -9999 }, sheetDrawingArea(strip), { x: 0, y: 0 }, { x: 1, y: 1 });
    assert.deepEqual([nw.x - nw.width / 2, nw.y - nw.height / 2], [25, 20]);
  });
});

describe('isResizable', () => {
  const view = (v: Record<string, unknown>) => ({ id: 'v', name: 'v', createdAt: 0, ...v }) as unknown as ProjectView;

  it('resizes a cut drawing and a vector axonometric, never a detail, a raster, a drafting view or no view', () => {
    const plan = view({ kind: 'plan', level: { name: 'L', elevation: 0 } });
    assert.equal(isResizable(plan), true);
    assert.equal(isResizable({ ...plan, detail: { of: 'p', min: { x: 0, y: 0 }, max: { x: 2, y: 2 }, number: 1 } } as ProjectView), false, 'a detail shows exactly its area');
    assert.equal(isResizable(view({ kind: '3d', projection: 'axonometric' })), true, 'vector axonometric');
    assert.equal(isResizable(view({ kind: '3d', projection: 'perspective' })), false, 'a perspective prints as a raster');
    assert.equal(isResizable(view({ kind: '3d', projection: 'axonometric', shaded: true })), false, 'a shaded axonometric prints as a raster');
    assert.equal(isResizable(view({ kind: 'drafting' })), false);
    assert.equal(isResizable(undefined), false);
  });
});

describe('a resized viewport in the project file (#139)', () => {
  beforeEach(() => resetProject());

  it('keeps its manual size, its centre and its place through the sidecar file and the package', async () => {
    const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] };
    useProjectStore.setState({ sheets: [sheet] });
    const f = resizedFrame(vp, { width: 120, height: 80 }, 'se', { x: 250, y: 215 }, area, { x: 150, y: 150 }, { x: 1, y: 1 });
    updateViewport('s', 'vp', f);
    const saved = projectDocument();
    const stored = saved.sheets?.[0]?.viewports?.[0];
    assert.deepEqual([stored?.width, stored?.height], [f.width, f.height]);

    const viaFile = parseProjectFile(serializeProject(saved));
    assert.deepEqual(viaFile.sheets?.[0]?.viewports?.[0], stored);
    const { files } = await buildPackage({ projectId: 'p', doc: saved, models: [] });
    const viaPackage = await readPackage(unzipPackage(zipPackage(files)));
    assert.deepEqual(viaPackage.doc.sheets?.[0]?.viewports?.[0], stored);

    resetProject();
    loadProjectDocument(viaFile);
    assert.deepEqual(useProjectStore.getState().sheets[0].viewports?.[0], stored);
  });
});
