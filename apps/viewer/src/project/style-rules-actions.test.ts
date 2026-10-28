/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A template's class and material mapping (#31) where it meets the project: the cut hatches a rule gives, and a drawing that
 * leaves its template (detach, or the template deleted) keeping the look, rules included, without the field only a resolution has.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewGraphics, type ProjectViewTemplate } from '@bimvoice/ifcsheet';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from './project-store';
import { cutHatches, type StyledDrawing } from './view-graphics';
import { deleteViewTemplate, detachViewTemplate } from './view-template-actions';
import type { ProjectView } from './types';

const ring = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
const polygon = (entityId: number, ifcType: string, materialId?: number) => ({ entityId, ifcType, ...(materialId !== undefined ? { materialId } : {}), polygon: { outer: ring, holes: [] }, color: [0, 0, 0, 1] });
const drawing = { cutPolygons: [polygon(1, 'IfcWallStandardCase', 5), polygon(2, 'IfcSlab', 5), polygon(3, 'IfcWallStandardCase')], lines: [] } as unknown as StyledDrawing;
const materialOf = (_entity: number, material: number) => (material === 5 ? 'Concrete' : null);
const template = (graphics: ProjectViewTemplate['graphics']): ProjectViewTemplate => ({ id: 't1', name: 'Plans', kind: 'plan', graphics });
const resolved = (graphics: ProjectViewTemplate['graphics'], own?: ProjectView['graphics']) => resolveViewGraphics({ templateId: 't1', graphics: own }, [template(graphics)]);
const hatchesOf = (g: ReturnType<typeof resolved>) => cutHatches(drawing, g, undefined, materialOf).map((h) => [h.source?.entityId, h.pattern, h.scale]);

describe('the cut hatches of a template\'s mapping', () => {
  it('a class rule hatches that class\'s cut faces and no other', () => {
    const g = resolved({ styleRules: [{ id: 'r', by: 'class', match: ['IfcWall'], style: { cutHatch: 'LINES45', hatchScale: 2 } }] });
    assert.deepEqual(hatchesOf(g), [[1, 'LINES45', 2], [3, 'LINES45', 2]]);
  });

  it('a material rule hatches the faces of that material, over a class rule; the view\'s own category hatch beats both', () => {
    const rules = [
      { id: 'c', by: 'class' as const, match: ['IfcWall'], style: { cutHatch: 'LINES45' } },
      { id: 'm', by: 'material' as const, match: ['concrete'], style: { cutHatch: 'CROSS' } },
    ];
    assert.deepEqual(hatchesOf(resolved({ styleRules: rules })), [[1, 'CROSS', 1], [2, 'CROSS', 1], [3, 'LINES45', 1]]);
    assert.deepEqual(hatchesOf(resolved({ styleRules: rules, categories: { walls: { cutHatch: 'TILES' } } })).filter(([id]) => id === 1), [[1, 'CROSS', 1]], 'the template\'s own category gives way');
    assert.deepEqual(hatchesOf(resolved({ styleRules: rules }, { categories: { walls: { cutHatch: 'TILES' } } })).filter(([id]) => id !== 2), [[1, 'TILES', 1], [3, 'TILES', 1]], 'the view\'s own category beats the mapping');
  });

  it('without a mapping nothing is hatched by it', () => {
    assert.deepEqual(hatchesOf(resolved({})), []);
  });
});

describe('a drawing leaving a template that has rules', () => {
  beforeEach(() => {
    resetProject();
    clearDraftHistory();
    const t = template({ categories: { walls: { lineWeight: 'light' } }, styleRules: [{ id: 'r', by: 'class', match: ['IfcWall'], style: { fillColor: '#666666' } }] });
    const view = { id: 'v1', name: 'L1', kind: 'plan', templateId: 't1', graphics: { categories: { doors: { visible: false } } } } as unknown as ProjectView;
    useProjectStore.setState({ viewTemplates: [t], views: [view] });
  });

  for (const [name, leave] of [['detach', () => detachViewTemplate('v1')], ['template deleted', () => deleteViewTemplate('t1')]] as const) {
    it(`${name}: the drawing keeps the rules and its categories, and no resolution-only field`, () => {
      leave();
      const view = useProjectStore.getState().views[0];
      assert.equal(view.templateId, undefined);
      assert.deepEqual(view.graphics, { categories: { walls: { lineWeight: 'light' }, doors: { visible: false } }, styleRules: [{ id: 'r', by: 'class', match: ['IfcWall'], style: { fillColor: '#666666' } }] });
      assert.equal('ownCategories' in (view.graphics ?? {}), false);
    });
  }
});
