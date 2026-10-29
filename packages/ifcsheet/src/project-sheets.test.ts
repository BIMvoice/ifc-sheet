/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafts `ifcsheet build --project` has nowhere to draw (#479): the sheet prints a view's drafts only over the drawing cut from
 * the model, so the drafts of a drafting view and those drawn on a sheet itself are not printed. They are said on stderr
 * (`onLeftOut`), not dropped without a word.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectSheet, ProjectView } from './document.js';
import type { DraftEntity } from './draft-types.js';
import type { OpenedModel } from './model.js';
import { readProjectSet } from './project-set.js';
import { projectSheetOptions, type LeftOut } from './project-sheets.js';

const line = (id: string, viewId: string): DraftEntity => ({ id, viewId, layerId: '0', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params: {} });
const detail: ProjectView = { id: 'detail', name: 'Eaves detail', kind: 'drafting', createdAt: 0 } as ProjectView;
const sheet = (id: string, number: string, viewIds: string[]): ProjectSheet =>
  ({ id, number, name: 'Details', createdAt: 0, viewports: viewIds.map((viewId, i) => ({ id: `${id}-vp${i}`, viewId, x: 100, y: 100, scale: 10 })) }) as unknown as ProjectSheet;

const leftOut = (drafts: DraftEntity[], sheets: ProjectSheet[]): LeftOut[] => {
  const set = { ...readProjectSet({}), views: [detail], sheets, drafts };
  const said: LeftOut[] = [];
  projectSheetOptions({ set, schedules: [] }, {} as OpenedModel, 'en', 'en', 'm.ifc', (left) => said.push(left));
  return said;
};

describe('drafts the engine has nowhere to draw', () => {
  it('a drafting view\'s drafts are said, once per sheet', () => {
    expect(leftOut([line('a', 'detail'), line('b', 'detail')], [sheet('s1', 'A-501', ['detail'])])).toEqual([{ sheet: 'A-501 Details', what: 'the drafts on the drafting view "Eaves detail"' }]);
  });

  it('drafts drawn on a sheet itself are said', () => {
    expect(leftOut([line('c', 's1')], [sheet('s1', 'A-501', [])])).toEqual([{ sheet: 'A-501 Details', what: 'the drafts drawn on the sheet itself' }]);
  });

  it('a drafting view without drafts, or not on a sheet, says nothing', () => {
    expect(leftOut([], [sheet('s1', 'A-501', ['detail'])])).toEqual([]);
    expect(leftOut([line('a', 'detail')], [sheet('s1', 'A-501', [])])).toEqual([]);
  });
});
