/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * CEILTAG keys each tag to the ceiling's GlobalId, which the project file keeps across reloads; a renderer id
 * does not survive a re-export or a different load order, so a second run must recognise the ceiling by GlobalId.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import type { ProjectView } from '@/project/types';
import { ceilTag } from './ceiltag.js';

const view = {
  id: 'view-1', kind: 'plan', name: 'Level 1 RCP', scale: 100, reflected: true, cutHeight: 1.2,
  level: { name: 'Level 1', elevation: 0, storeyGlobalIds: [] },
} as unknown as ProjectView;

/** One flat ceiling covering 2.70 above the floor, under renderer id `renderId`. */
function loadCeiling(renderId: number): void {
  const mesh = {
    expressId: renderId, ifcType: 'IfcCovering',
    positions: new Float32Array([0, 2.7, 0, 4, 2.7, 0, 4, 2.7, 3, 0, 2.7, 3]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
  publishDrawingRuntime({
    geometryResult: { meshes: [mesh], coordinateInfo: undefined } as never,
    sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false,
  });
}

function context(): Parameters<typeof ceilTag>[0] {
  return {
    viewId: 'view-1',
    layerId: '0',
    settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard' },
    view: () => view,
    entities: () => useProjectStore.getState().drafts,
    say: () => {},
  } as unknown as Parameters<typeof ceilTag>[0];
}

const ceilingTexts = () => useProjectStore.getState().drafts.filter((d) => d.params.ceilingOf !== undefined);
const SAME_GUID = (): string => '2CEIL00000000000000001';

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(() => publishDrawingRuntime(null));

describe('CEILTAG run twice', () => {
  it('keys the tag to the ceiling\'s GlobalId, not its renderer id', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    assert.deepEqual(ceilingTexts().map((d) => d.params.ceilingOf), ['2CEIL00000000000000001']);
  });

  it('leaves one tag when the same ceiling comes back under another renderer id', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    loadCeiling(5100);
    ceilTag(context(), () => true, SAME_GUID);
    assert.equal(ceilingTexts().length, 1);
  });

  it('leaves one tag when run twice on the same load', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    ceilTag(context(), () => true, SAME_GUID);
    assert.equal(ceilingTexts().length, 1);
  });

  it('tags a different ceiling that is not tagged yet', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    loadCeiling(200);
    ceilTag(context(), () => true, () => '2CEIL00000000000000002');
    assert.equal(ceilingTexts().length, 2);
  });
});
