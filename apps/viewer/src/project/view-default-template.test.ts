/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drawing made after the set was built takes the project's template for its kind (#44): a plan for a level that appears later, a
 * section on a plan, Add a drawing, the levels folder, a copy. A project with no templates (an older one) assigns none.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionOnPlan } from '@/drafting/section-create';
import { clearDraftHistory } from '@/drafting/draft-store';
import { addProjectView, duplicateProjectView, loadProjectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import { planViewFor } from './view-defaults';
import { viewPlaneConfig } from './view-plane-config';
import { ensureViewTemplates } from './view-template-start';
import type { PlanProjectView, ProjectView } from './types';

const state = () => useProjectStore.getState();
const templateOf = (kind: 'plan' | 'section' | 'elevation'): string | undefined => state().viewTemplates?.find((t) => t.kind === kind)?.id;
const view = (id: string): ProjectView => state().views.find((v) => v.id === id)!;
const LEVELS = [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }];

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], LEVELS);
});

/** The project after its set was built: the three starting templates exist. */
const withTemplates = (): void => { ensureViewTemplates(); clearDraftHistory(); };

const sectionOnFirstPlan = (): string | null => {
  const plan = state().views.find((v): v is PlanProjectView => v.kind === 'plan')!;
  const config = viewPlaneConfig(plan, state().levels, null)!;
  return createSectionOnPlan({ planViewId: plan.id, plan: config, a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, side: { x: 2, y: 2 }, layerId: '0', textHeight: 0.25 });
};

describe('a drawing made after the set was built', () => {
  beforeEach(withTemplates);

  it('Add a drawing (a plan for a level, an elevation) takes the template of its kind', () => {
    const plan = addProjectView({ ...planViewFor(state().levels[1]!, state().views, Date.now(), state().levels), auto: false });
    const elevation = addProjectView({ kind: 'elevation', name: 'West', direction: 'west' } as never);
    assert.equal(view(plan).templateId, templateOf('plan'));
    assert.equal(view(elevation).templateId, templateOf('elevation'));
  });

  it('a section made on a plan takes the Sections template', () => {
    const id = sectionOnFirstPlan();
    assert.ok(id);
    assert.equal(view(id).templateId, templateOf('section'));
  });

  it('a plan for a level that appears later takes the Plans template; the plans before keep theirs', () => {
    const before = state().views.filter((v) => v.kind === 'plan').map((v) => [v.id, v.templateId]);
    syncProjectWithModels([{ key: 'm', name: 'm' }], [...LEVELS, { name: 'Level 2', elevation: 6 }]);
    const plans = state().views.filter((v) => v.kind === 'plan');
    assert.equal(plans.length, before.length + 1);
    for (const p of plans) assert.equal(p.templateId, templateOf('plan'), p.name);
  });

  it('a project opened from a file gets the plans of levels the file lacks, with the template', () => {
    const doc = { ...state(), views: state().views.filter((v) => v.kind !== 'plan' || v.level.elevation === 0) };
    loadProjectDocument(doc as never);
    const plans = state().views.filter((v) => v.kind === 'plan');
    assert.equal(plans.length, 2);
    for (const p of plans) assert.equal(p.templateId, templateOf('plan'), p.name);
  });

  it('a copy of a drawing keeps the template it had, and one that had none takes the kind\'s', () => {
    const plan = state().views.find((v) => v.kind === 'plan')!;
    const copy = duplicateProjectView(plan.id)!;
    assert.equal(view(copy).templateId, templateOf('plan'));
    const bare = addProjectView({ kind: 'plan', name: 'Bare', level: { name: 'X', elevation: 9, storeyGlobalIds: [] }, templateId: undefined } as never);
    assert.equal(view(bare).templateId, templateOf('plan'));
  });

  it('keeps a template the view already names, and gives none to a 3D view or a drafting view', () => {
    const named = addProjectView({ kind: 'plan', name: 'Own', level: { name: 'Y', elevation: 12, storeyGlobalIds: [] }, templateId: 'mine' } as never);
    const threeD = addProjectView({ kind: '3d', name: 'Axo', viewpoint: null, projection: 'axonometric', scale: 200 } as never);
    assert.equal(view(named).templateId, 'mine');
    assert.equal(view(threeD).templateId, undefined);
  });
});

describe('a project with no templates (an older one)', () => {
  it('assigns none, by any way of making a drawing', () => {
    assert.deepEqual(state().viewTemplates ?? [], []);
    const plan = addProjectView({ ...planViewFor(state().levels[1]!, state().views, Date.now(), state().levels), auto: false });
    const section = sectionOnFirstPlan()!;
    syncProjectWithModels([{ key: 'm', name: 'm' }], [...LEVELS, { name: 'Level 2', elevation: 6 }]);
    const copy = duplicateProjectView(plan)!;
    assert.equal(state().views.some((v) => v.templateId !== undefined), false);
    assert.ok(view(section) && view(copy));
  });
});
