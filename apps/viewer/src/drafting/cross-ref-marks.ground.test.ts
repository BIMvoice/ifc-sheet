/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectView } from '@/project/types';
import { groundPlan } from '@/project/drawing-set';
import { groundPlan as actionsGroundPlan } from '@/project/drawing-set-actions';
import { elevationMarkPlan, viewsNamedOnPlan } from './cross-ref-marks';

/** The plan that carries the elevation marks is the ground plan the engine puts the sections on (#244). */

const plan = (id: string, elevation: number): ProjectView =>
  ({ id, kind: 'plan', name: id, createdAt: 0, cutHeight: 1.2, level: { name: id, elevation, storeyGlobalIds: [] } }) as ProjectView;
const elevation = (id: string): ProjectView => ({ id, kind: 'elevation', name: id, direction: 'west', createdAt: 0 });

// The duplex: a foundation storey at -1.25 below Level 1 at 0.
const duplex = [plan('T/FDN', -1.25), plan('Level 1', 0), plan('Level 2', 3.1), elevation('e-west')];

describe('the plan that carries the elevation marks', () => {
  it('is the ground floor, not the foundation below it', () => {
    assert.equal(elevationMarkPlan(duplex)?.id, 'Level 1');
    assert.deepEqual(viewsNamedOnPlan('Level 1', [], duplex), ['e-west']);
    assert.deepEqual(viewsNamedOnPlan('T/FDN', [], duplex), []);
  });

  it('is the one plan the engine and the viewer both call the ground plan', () => {
    assert.equal(groundPlan, actionsGroundPlan);
    assert.equal(elevationMarkPlan(duplex)?.id, groundPlan(duplex)?.id);
  });
});
