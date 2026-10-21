/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The wheel on the Wall: a notch moves a plan's cut by 5 cm within the
 * offered range, and a section's depth by half a metre, an automatic depth
 * starting from 5 m when the model's size is not known, else from the depth
 * the drawing really looks (the one the section's depth band shows).
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { selectedSectionBand } from '@/drafting/section-depth';
import { sectionSymbolShapes } from '@/drafting/section-symbol';
import type { DraftEntity } from '@/drafting/types';
import { updateProjectView } from '@/project/project-store';
import { CUT_HEIGHT_RANGE, drawTarget, nudgeCutHeight, nudgeViewDepth, setCutHeight } from './wall-actions.js';

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const section: ProjectView = { id: 's', kind: 'section', name: 'Section A-A', createdAt: 0, plane: { axis: 'front', offset: 0, flipped: false } };
const view = (id: string) => useProjectStore.getState().views.find((v) => v.id === id);

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ views: [plan, section] });
});

describe('cut height on the Wall', () => {
  it('steps by 5 cm a notch, up and down', () => {
    nudgeCutHeight('p', 1);
    nudgeCutHeight('p', 1);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, 1.3);
    nudgeCutHeight('p', -4);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, 1.1);
  });

  it('stays within the offered range and on its step', () => {
    setCutHeight('p', 9);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, CUT_HEIGHT_RANGE.max);
    setCutHeight('p', 1.234);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, 1.25);
  });

  it('leaves a section\'s plane alone', () => {
    nudgeCutHeight('s', 1);
    assert.deepEqual(view('s'), section);
  });
});

describe('view depth on the Wall', () => {
  it('starts an automatic depth at 5 m and steps by half a metre', () => {
    nudgeViewDepth('s', 1);
    assert.equal(view('s')?.viewDepth, 5.5);
    nudgeViewDepth('s', -2);
    assert.equal(view('s')?.viewDepth, 4.5);
  });
});

describe('one stored depth for the wheel and the section\'s depth band', () => {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 8 } };
  const load = () => useViewerStore.setState({ models: new Map(), geometryResult: { meshes: [], coordinateInfo: { shiftedBounds: bounds } } as never });
  const symbol = (): DraftEntity[] => sectionSymbolShapes({ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 5, y: 4 }, 'A', 0.25).map((shape, i) => ({ id: `e${i}`, viewId: 'p', layerId: '0', shape, params: { sectionOf: 's' } }) as DraftEntity);
  const band = () => selectedSectionBand(new Set(['e0']), symbol(), useProjectStore.getState().views, mergedSectionBounds(useViewerStore.getState().models, useViewerStore.getState().geometryResult));

  it('starts the wheel where the band is drawn when the section has no depth of its own', () => {
    load();
    const shown = band()?.depth;
    assert.ok(shown && shown > 0, 'the band shows the depth the drawing really looks');
    nudgeViewDepth('s', 1);
    assert.equal(view('s')?.viewDepth, Math.round((shown + 0.5) / 0.5) * 0.5);
  });

  it('moves the depth a dragged band set, and the band shows what the wheel set', () => {
    load();
    updateProjectView('s', { viewDepth: 3.55 });
    assert.equal(band()?.depth, 3.55);
    nudgeViewDepth('s', 1);
    assert.equal(view('s')?.viewDepth, 4);
    assert.equal(band()?.depth, 4);
  });
});

describe('where a plain drawing tool draws (#143)', () => {
  it('on the drawing in front, else the sheet\'s paper', () => {
    assert.equal(drawTarget('line', 'view-1', 'sheet-1'), 'view-1');
    assert.equal(drawTarget('text', undefined, 'sheet-1'), 'sheet-1');
  });

  it('parameter text is always on the paper, since only a sheet resolves its names', () => {
    assert.equal(drawTarget('ptext', 'view-1', 'sheet-1'), 'sheet-1');
  });
});
