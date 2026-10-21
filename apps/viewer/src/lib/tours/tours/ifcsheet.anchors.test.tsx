/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { fixtureModel, fixtureModels } from '@/test/store-fixture.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { IfcSheetShell } from '@/components/viewer/ifcsheet/IfcSheetShell.js';
import { WallIntro } from '@/components/viewer/wall/WallIntro.js';
import { stepInto, useWallNav } from '@/components/viewer/wall/wall-nav.js';
import { anchorSelector } from '../anchors.js';
import { IFCSHEET_TOUR } from './ifcsheet.js';

/**
 * The IfcSheet tour against the real Wall: every step's target is looked up
 * in the surface the step is shown over, so renaming or removing an anchored
 * element breaks this test, not the user's tour.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const initial = useViewerStore.getState();

/** Where each step's target lives. A step with no entry fails, so a new step must say. */
const SURFACE: Record<string, 'intro' | 'sheet' | 'header' | 'none'> = {
  open: 'header',
  drawn: 'none',
  hang: 'intro',
  sheet: 'none',
  tools: 'sheet',
  issue: 'header',
};

beforeEach(() => {
  window.localStorage.setItem('ifc-lite:tours:v1', JSON.stringify({ tours: {}, notices: { 'ifcsheet-tour': 'seen' } }));
  resetProject();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  act(() => { useViewerStore.setState({ ...fixtureModels(fixtureModel('m')), loading: false, geometryStreamingActive: false }); });
});
afterEach(() => {
  cleanup();
  act(() => { stepInto(null); });
  useViewerStore.setState(initial);
  window.localStorage.clear();
});

function surfaceFor(kind: 'intro' | 'sheet' | 'header'): HTMLElement {
  if (kind === 'intro') return render(<WallIntro modelName="m" extent={HOUSE} onHang={() => {}} />);
  const ui = render(<IfcSheetShell />);
  if (kind === 'sheet') {
    act(() => { stepInto(useProjectStore.getState().sheets[0].id); });
  }
  return ui;
}

describe('IfcSheet tour anchors', () => {
  it('names a surface for every step, and only a step without a target has none', () => {
    assert.deepEqual(Object.keys(SURFACE).sort(), IFCSHEET_TOUR.steps.map((s) => s.id).sort());
    for (const step of IFCSHEET_TOUR.steps) assert.equal(step.anchor === undefined, SURFACE[step.id] === 'none', step.id);
  });

  for (const step of IFCSHEET_TOUR.steps.filter((s) => SURFACE[s.id] !== 'none')) {
    it(`step "${step.id}" finds its target in the ${SURFACE[step.id]} surface`, () => {
      const surface = SURFACE[step.id] as 'intro' | 'sheet' | 'header';
      assert.ok(step.anchor, 'the step has an anchor');
      const ui = surfaceFor(surface);
      assert.ok(ui.querySelector(anchorSelector(step.anchor)), `nothing in the ${SURFACE[step.id]} surface matches ${anchorSelector(step.anchor)}`);
      assert.equal(useWallNav.getState().stepped !== null, SURFACE[step.id] === 'sheet');
    });
  }
});
