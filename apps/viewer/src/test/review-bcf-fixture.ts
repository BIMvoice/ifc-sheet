/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The review tests' BCF fixture: a single 2 m x 2 m wall cut on a plan; the
 * sheet shows it at 1:50 with the drawing's middle at the viewport's, so
 * drawing (3, 2) is paper (150, 150).
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { ProjectSheet } from '@/project/types';
import type { ReviewComment } from '@/review/types';

export const GUID = '2O2Fr$t4X7Zf8NOew3FLOH';
const square = [{ x: 2, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 2, y: 3 }];
export const drawing = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false } },
  lines: [], projectionPolygons: [],
  cutPolygons: [{ polygon: { outer: square, holes: [] }, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  bounds: { min: { x: 0, y: 0 }, max: { x: 6, y: 4 } },
} as unknown as Drawing2D;
export const drawingOf = (id: string) => (id === 'p' ? drawing : null);
export const guidOf = (id: number) => (id === 7 ? GUID : null);
export const sheet: ProjectSheet = {
  id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape',
  viewports: [{ id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null }],
};
export const onElement: ReviewComment = {
  id: 'c1', sheetId: 's', x: 150, y: 150, viewportId: 'vp', viewId: 'p', point: { x: 3, y: 2 }, elementGuid: GUID,
  author: 'Ștefan Țurcanu', createdAt: 1760000000000, status: 'open', text: 'Cotă lipsă la ușă: șapă, țeavă, ăsta',
  replies: [{ id: 'r1', author: 'Ioana Pătrașcu', createdAt: 1760000060000, text: 'Adăugată în plan' }],
};
export const onPaper: ReviewComment = { ...onElement, id: 'c2', x: 20, y: 20, elementGuid: undefined, viewportId: undefined, viewId: undefined, point: undefined, text: 'Scara lipsește' };
