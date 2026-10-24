/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { groundPlan } from './drawing-set.js';
import type { ProjectView } from './document.js';

const plan = (id: string, elevation: number, extra: Partial<ProjectView> = {}): ProjectView =>
  ({ id, kind: 'plan', name: id, createdAt: 0, cutHeight: 1.2, level: { name: id, elevation, storeyGlobalIds: [] }, ...extra }) as ProjectView;

const pick = (...views: ProjectView[]) => groundPlan(views)?.id;

describe('the plan that carries the elevation marks and sections (#244)', () => {
  it('is the ground floor, not the foundation below it (duplex: T/FDN -1.25, Level 1 0, Level 2 3.1)', () => {
    expect(pick(plan('T/FDN', -1.25), plan('Level 1', 0), plan('Level 2', 3.1), plan('Roof', 6))).toBe('Level 1');
  });

  it('does not depend on the order of the views', () => {
    expect(pick(plan('Roof', 6), plan('Level 2', 3.1), plan('Level 1', 0), plan('T/FDN', -1.25))).toBe('Level 1');
  });

  it('keeps a ground floor set a little below the datum, which is not a basement', () => {
    expect(pick(plan('fundering', -1.4), plan('begane grond', -0.15), plan('1e', 2.85))).toBe('begane grond');
  });

  it('takes the lowest storey when the model has none below ground', () => {
    expect(pick(plan('Erdgeschoss', 0), plan('Dachgeschoss', 2.7))).toBe('Erdgeschoss');
  });

  it('takes the lowest storey when the datum is a site elevation and every storey is far above 0', () => {
    expect(pick(plan('EG', 101.2), plan('OG', 104.0))).toBe('EG');
  });

  it('takes the storey nearest ground when every storey is below it', () => {
    expect(pick(plan('-2', -6), plan('-1', -3))).toBe('-1');
  });

  it('ignores site plans and returns null with no plan', () => {
    expect(pick(plan('Site', 0, { site: true } as Partial<ProjectView>), plan('Level 1', 0.5))).toBe('Level 1');
    expect(groundPlan([])).toBeNull();
  });
});
