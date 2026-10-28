/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #488: changing a viewport's scale must not change the paper size of the text and dimension text drawn on its view. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDraft } from '@/drafting/draft-store';
import type { AnnotationShape } from '@/drafting/types';
import { resetProject, syncProjectWithModels, useProjectStore } from './project-store.js';
import { startDrawingSet } from './drawing-set-actions.js';
import { setViewportScale } from './sheets.js';
import { annotationAtFactor, annotationFactor } from './viewport-annotation.js';

const state = () => useProjectStore.getState();
const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };

/** The height in paper millimetres the sheet prints for `shape` in the viewport `vpId`. */
function printedMm(vpId: string, viewId: string, shape: AnnotationShape): number {
  const vp = state().sheets.flatMap((s) => s.viewports ?? []).find((v) => v.id === vpId)!;
  const view = state().views.find((v) => v.id === viewId)!;
  const shown = annotationAtFactor(shape, annotationFactor(vp.scale, view.scale));
  return ((shown as { height: number }).height * 1000) / vp.scale;
}

describe('annotation text keeps its paper height when the viewport scale changes (#488)', () => {
  beforeEach(() => {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }]);
    startDrawingSet(null, bounds);
  });

  for (const target of [50, 200]) {
    it(`a note and a dimension drawn at 1:100 print 2.5 mm at 1:${target}`, () => {
      const sheet = state().sheets.find((s) => (s.viewports ?? []).some((v) => state().views.find((w) => w.id === v.viewId)?.kind === 'plan'))!;
      const vp = (sheet.viewports ?? []).find((v) => state().views.find((w) => w.id === v.viewId)?.kind === 'plan')!;
      setViewportScale(sheet.id, vp.id, vp.viewId, 100);
      const note = newDraft(vp.viewId, 'layer', { type: 'text', p: { x: 1, y: 1 }, text: 'Kitchen', height: 0.25, rotation: 0 });
      const dim = newDraft(vp.viewId, 'layer', { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, at: { x: 0, y: 1 }, height: 0.25 } as AnnotationShape);
      useProjectStore.setState({ drafts: [...state().drafts, note, dim] });
      setViewportScale(sheet.id, vp.id, vp.viewId, target);
      for (const id of [note.id, dim.id]) {
        const d = state().drafts.find((x) => x.id === id)!;
        assert.ok(Math.abs(printedMm(vp.id, vp.viewId, d.shape as AnnotationShape) - 2.5) < 1e-9, `${d.shape.type} at 1:${target}`);
      }
    });
  }
});
