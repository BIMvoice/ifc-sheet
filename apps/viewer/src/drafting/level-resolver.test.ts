/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a level mark reads in its view: a plan's mark follows the elevation of
 * its storey when the level is edited, a section's follows its point on the
 * view's plane, and the same reading is what a printed sheet uses.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ElevationProjectView, PlanProjectView, ProjectLevel } from '@/project/types';
import { clearDraftHistory, newDraft } from './draft-store.js';
import type { LevelShape } from './level-mark.js';
import { levelResolverFor, storeyOf } from './level-resolver.js';
import { syncLevelMarks } from './level-sync.js';

const ground: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: ['G0'] };
const first: ProjectLevel = { name: 'Level 1', elevation: 3, storeyGlobalIds: ['G1'] };
const planOf = (level: ProjectLevel): PlanProjectView => ({ id: `plan-${level.name}`, name: level.name, kind: 'plan', level, cutHeight: 1.2, createdAt: 1 });
const elevation: ElevationProjectView = { id: 'e1', name: 'North', kind: 'elevation', direction: 'north', createdAt: 2 };
const frontPlane: SectionPlaneConfig = { axis: 'z', position: 0, flipped: false };
const mark = (storey: string | undefined, value: number): LevelShape => ({ type: 'level', p: { x: 1, y: 1 }, value, height: 0.25, ref: { at: { x: 0, y: 2.5 }, ...(storey ? { storey } : {}) } });

beforeEach(() => {
  resetProject();
  clearDraftHistory();
});

describe('a plan mark follows its storey', () => {
  it('reads the elevation of the storey it names, and the new one after the level is edited', () => {
    const view = planOf(first);
    assert.equal(levelResolverFor(view, [ground, first], undefined)(mark('G1', 0).ref!), 3);
    const raised = { ...first, elevation: 3.5 };
    // The plan still carries the old level; the project's level list is what was edited.
    assert.equal(levelResolverFor(view, [ground, raised], undefined)(mark('G1', 0).ref!), 3.5);
  });

  it('reads the storey named by the mark, not the one the plan shows', () => {
    assert.equal(levelResolverFor(planOf(ground), [ground, first], undefined)(mark('G1', 0).ref!), 3);
  });

  it('finds a storey by level name when no id was recorded, and records the id the plan reads', () => {
    assert.equal(levelResolverFor(planOf(ground), [ground, first], undefined)(mark('Level 1', 0).ref!), 3);
    assert.equal(storeyOf(planOf(first), [ground, first]), 'G1');
    assert.equal(storeyOf(planOf({ name: 'Roof', elevation: 6, storeyGlobalIds: [] }), []), 'Roof');
  });

  it('cannot read a plan mark with no storey, so it keeps its number', () => {
    assert.equal(levelResolverFor(planOf(first), [first], undefined)(mark(undefined, 3).ref!), null);
  });

  it('syncLevelMarks brings the stored number to the edited elevation, without touching other views', () => {
    const own = newDraft('plan-Level 1', '0', mark('G1', 3));
    const other = newDraft('plan-Ground', '0', mark('G1', 3));
    useProjectStore.setState({ drafts: [own, other] });
    syncLevelMarks('plan-Level 1', levelResolverFor(planOf(first), [ground, { ...first, elevation: 3.5 }], undefined));
    const [a, b] = useProjectStore.getState().drafts;
    assert.equal((a.shape as LevelShape).value, 3.5);
    assert.equal((b.shape as LevelShape).value, 3);
  });
});

describe('a section mark reads its point on the view plane', () => {
  it('takes the height of the reference', () => {
    assert.equal(levelResolverFor(elevation, [ground], frontPlane)(mark(undefined, 0).ref!), 2.5);
  });

  it('cannot read without the view plane, so it keeps its number', () => {
    assert.equal(levelResolverFor(elevation, [ground], undefined)(mark(undefined, 0).ref!), null);
  });
});
