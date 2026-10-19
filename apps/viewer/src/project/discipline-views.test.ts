/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCIPLINES, DISCIPLINE_IDS, defaultDisciplineLevel, disciplineKeeps, disciplineViewFor,
  type DisciplineId, type DisciplineModel, type ElementFacts,
} from './discipline-views';
import { defaultViews, syncDefaultViews } from './view-defaults';
import { VIEW_CATEGORIES } from './view-graphics';
import { parseProjectFile, serializeProject } from './project-file';
import type { ProjectDocument, ProjectLevel } from './types';

/**
 * Which elements each discipline plan keeps, on synthetic element facts: the
 * class, LoadBearing true / false / missing, PredefinedType ROOF, a storey
 * below and above ground. The model: lowest storey at -3.0, the plan of the
 * storey at 0.
 */

const MODEL: DisciplineModel = { lowestStorey: -3, planStorey: 0 };
const NO_BASEMENT: DisciplineModel = { lowestStorey: 0, planStorey: 0 };

const facts = (className: string, over: Partial<ElementFacts> = {}): ElementFacts => ({
  className, predefinedType: '', loadBearing: null, storeyElevation: 0, aggregateClass: '', hostClass: '', hostPredefinedType: '', ...over,
});
const keeps = (d: DisciplineId, f: ElementFacts, m: DisciplineModel = MODEL) => disciplineKeeps(d, f, m);

describe('structural plan', () => {
  it('keeps walls only when LoadBearing is TRUE: false and missing are left out', () => {
    for (const wall of ['IFCWALL', 'IFCWALLSTANDARDCASE']) {
      assert.equal(keeps('structural', facts(wall, { loadBearing: true })), true);
      assert.equal(keeps('structural', facts(wall, { loadBearing: false })), false);
      assert.equal(keeps('structural', facts(wall, { loadBearing: null })), false);
    }
    assert.equal(keeps('structural', facts('IFCCURTAINWALL', { loadBearing: true })), false);
  });

  it('keeps columns, beams, members, slabs, footings and piles unless LoadBearing is FALSE', () => {
    for (const cls of ['IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER', 'IFCSLAB', 'IFCFOOTING', 'IFCPILE']) {
      assert.equal(keeps('structural', facts(cls, { loadBearing: null })), true, `${cls} without the property`);
      assert.equal(keeps('structural', facts(cls, { loadBearing: true })), true, `${cls} load-bearing`);
      assert.equal(keeps('structural', facts(cls, { loadBearing: false })), false, `${cls} not load-bearing`);
    }
  });

  it('leaves out a curtain wall mullion, and everything that is not framing', () => {
    assert.equal(keeps('structural', facts('IFCMEMBER', { predefinedType: 'MULLION' })), false);
    assert.equal(keeps('structural', facts('IFCMEMBER', { predefinedType: 'BRACE' })), true);
    for (const cls of ['IFCDOOR', 'IFCWINDOW', 'IFCFURNISHINGELEMENT', 'IFCSTAIR', 'IFCRAILING', 'IFCSPACE', 'IFCROOF', 'IFCCOVERING']) {
      assert.equal(keeps('structural', facts(cls, { loadBearing: true })), false, cls);
    }
  });

  it('draws the plan\'s own storey only', () => {
    assert.equal(keeps('structural', facts('IFCCOLUMN', { storeyElevation: 3 })), false);
    assert.equal(keeps('structural', facts('IFCCOLUMN', { storeyElevation: -3 })), false);
    assert.equal(keeps('structural', facts('IFCCOLUMN', { storeyElevation: 0.01 })), true);
    assert.equal(keeps('structural', facts('IFCCOLUMN', { storeyElevation: null })), true, 'an element on no storey is not dropped');
  });
});

describe('foundation plan', () => {
  it('keeps footings and piles, whatever the storey and the property', () => {
    for (const cls of ['IFCFOOTING', 'IFCPILE']) {
      assert.equal(keeps('foundation', facts(cls, { storeyElevation: 3, loadBearing: false })), true);
      assert.equal(keeps('foundation', facts(cls, { storeyElevation: null }), NO_BASEMENT), true);
    }
  });

  it('keeps the walls of the foundation storey (the lowest, below ±0.00), not those of the floors above', () => {
    assert.equal(keeps('foundation', facts('IFCWALL', { storeyElevation: -3 })), true);
    assert.equal(keeps('foundation', facts('IFCWALLSTANDARDCASE', { storeyElevation: -3, loadBearing: true })), true);
    assert.equal(keeps('foundation', facts('IFCWALL', { storeyElevation: -3, loadBearing: false })), false, 'a basement partition');
    assert.equal(keeps('foundation', facts('IFCWALL', { storeyElevation: 0, loadBearing: true })), false, 'a wall above ground');
    assert.equal(keeps('foundation', facts('IFCWALL', { storeyElevation: null })), false);
  });

  it('has no foundation walls in a model without a storey below ±0.00', () => {
    assert.equal(keeps('foundation', facts('IFCWALL', { storeyElevation: 0, loadBearing: true }), NO_BASEMENT), false);
    assert.equal(keeps('foundation', facts('IFCWALL', { storeyElevation: -0.04 }), { lowestStorey: -0.04, planStorey: 0 }), false, 'within the ground tolerance');
  });

  it('keeps a BASESLAB (the ground slab) anywhere, other slabs only on the foundation storey', () => {
    assert.equal(keeps('foundation', facts('IFCSLAB', { predefinedType: 'BASESLAB', storeyElevation: 0 }), NO_BASEMENT), true);
    assert.equal(keeps('foundation', facts('IFCSLAB', { predefinedType: 'FLOOR', storeyElevation: -3 })), true);
    assert.equal(keeps('foundation', facts('IFCSLAB', { predefinedType: 'FLOOR', storeyElevation: 0 })), false);
  });

  it('leaves out doors, windows, columns and beams', () => {
    for (const cls of ['IFCDOOR', 'IFCWINDOW', 'IFCCOLUMN', 'IFCBEAM', 'IFCROOF', 'IFCFURNISHINGELEMENT']) {
      assert.equal(keeps('foundation', facts(cls, { storeyElevation: -3 })), false, cls);
    }
  });
});

describe('roof plan', () => {
  it('keeps a roof, a ROOF slab, and what is aggregated into a roof', () => {
    assert.equal(keeps('roof', facts('IFCROOF')), true);
    assert.equal(keeps('roof', facts('IFCSLAB', { predefinedType: 'ROOF' })), true);
    assert.equal(keeps('roof', facts('IFCSLAB', { predefinedType: 'FLOOR' })), false);
    assert.equal(keeps('roof', facts('IFCSLAB', { predefinedType: '', aggregateClass: 'IFCROOF' })), true);
    assert.equal(keeps('roof', facts('IFCBUILDINGELEMENTPROXY', { aggregateClass: 'IFCROOF' })), true);
  });

  it('keeps a skylight, and a window that fills an opening in a roof or a ROOF slab', () => {
    assert.equal(keeps('roof', facts('IFCWINDOW', { predefinedType: 'SKYLIGHT' })), true);
    assert.equal(keeps('roof', facts('IFCWINDOW', { predefinedType: 'LIGHTDOME' })), true);
    assert.equal(keeps('roof', facts('IFCWINDOW', { hostClass: 'IFCROOF' })), true);
    assert.equal(keeps('roof', facts('IFCWINDOW', { hostClass: 'IFCSLAB', hostPredefinedType: 'ROOF' })), true);
    assert.equal(keeps('roof', facts('IFCWINDOW', { hostClass: 'IFCWALL' })), false);
    assert.equal(keeps('roof', facts('IFCWINDOW', { predefinedType: 'WINDOW' })), false);
  });

  it('leaves out walls, doors, columns, beams and floor slabs', () => {
    for (const cls of ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCDOOR', 'IFCCOLUMN', 'IFCBEAM', 'IFCFOOTING', 'IFCFURNISHINGELEMENT']) {
      assert.equal(keeps('roof', facts(cls, { loadBearing: true })), false, cls);
    }
  });
});

describe('the starters', () => {
  const levels: ProjectLevel[] = [
    { name: 'Roof', elevation: 6, storeyGlobalIds: ['R'] },
    { name: 'Ground', elevation: 0, storeyGlobalIds: ['G'] },
    { name: 'Basement', elevation: -3, storeyGlobalIds: ['B'] },
  ];

  it('are plans with a discipline, a cut, a depth and their own graphics, built on the view\'s settings', () => {
    for (const id of DISCIPLINE_IDS) {
      const view = disciplineViewFor(id, levels[1], []);
      assert.equal(view.kind, 'plan');
      assert.equal(view.kind === 'plan' && view.discipline, id);
      assert.equal(view.kind === 'plan' && view.cutHeight, DISCIPLINES[id].cutHeight);
      assert.equal(view.viewDepth, DISCIPLINES[id].viewDepth);
      assert.equal(view.graphics?.presetId, DISCIPLINES[id].presetId);
      assert.equal(view.auto, false);
      // Only categories the view graphics know: a typo would be a silent no-op.
      const known = new Set<string>(VIEW_CATEGORIES.map((c) => c.id));
      for (const category of Object.keys(view.graphics?.categories ?? {})) assert.ok(known.has(category), `${id}: ${category}`);
    }
  });

  it('hide what they do not draw, and the structural plan draws heavier cut lines', () => {
    const structural = disciplineViewFor('structural', levels[1], []).graphics?.categories ?? {};
    for (const hidden of ['doors', 'windows', 'furniture', 'stairs', 'railings']) assert.equal(structural[hidden]?.visible, false, hidden);
    assert.equal(structural.walls?.lineWeight, 'heavy');
    assert.equal(structural.columns?.lineWeight, 'heavy');
    const roof = disciplineViewFor('roof', levels[1], []).graphics?.categories ?? {};
    assert.equal(roof.windows?.visible, undefined, 'skylights stay visible');
    assert.equal(roof.doors?.visible, false);
  });

  it('put the foundation plan on the lowest level and the roof plan on the highest, the structural plan on a level picked', () => {
    assert.equal(defaultDisciplineLevel('foundation', levels)?.name, 'Basement');
    assert.equal(defaultDisciplineLevel('roof', levels)?.name, 'Roof');
    assert.equal(defaultDisciplineLevel('structural', levels), undefined);
    assert.equal(defaultDisciplineLevel('roof', []), undefined);
  });

  it('give the roof plan a cut above any roof and a depth that reaches back down through the model', () => {
    assert.ok(DISCIPLINES.roof.cutHeight >= 50);
    assert.ok(DISCIPLINES.roof.viewDepth >= DISCIPLINES.roof.cutHeight);
  });

  it('are named by discipline and level, unique among the views', () => {
    const first = disciplineViewFor('foundation', levels[2], []);
    const second = disciplineViewFor('foundation', levels[2], [{ ...first, createdAt: 0 } as never]);
    assert.equal(first.name, 'Foundation Plan - Basement');
    assert.equal(second.name, 'Foundation Plan - Basement (2)');
  });

  it('do not stand in for the plan of their level', () => {
    const views = [...defaultViews(levels)];
    const without = views.filter((v) => !(v.kind === 'plan' && v.level.name === 'Ground'));
    const withStructural = [...without, { ...disciplineViewFor('structural', levels[1], without), createdAt: 0 } as never];
    const synced = syncDefaultViews(withStructural, levels);
    assert.ok(synced.some((v) => v.kind === 'plan' && !v.discipline && v.level.name === 'Ground'), 'the Ground plan was still made');
  });

  it('keep their discipline through the project file', () => {
    const view = { ...disciplineViewFor('roof', levels[0], []), createdAt: 5 };
    const doc = { name: 'p', models: [], views: [view], sheets: [], drafts: [], draftLayers: [] } as unknown as ProjectDocument;
    const read = parseProjectFile(serializeProject(doc));
    const plan = read.views[0];
    assert.equal(plan.kind === 'plan' && plan.discipline, 'roof');
  });
});
