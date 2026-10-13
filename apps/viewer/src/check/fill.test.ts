/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The one-value fix of a title-block field, and the grouped finding it answers. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addProjectSheet, resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { fillTitleBlockEverywhere } from './fill-actions.js';
import { fillTitleBlock } from './fill.js';
import { checkSet } from './findings.js';
import { groupBySheet } from './say.js';
import type { CheckInput, Finding } from './types.js';

const sheet = (id: string, titleBlock: Record<string, string>): ProjectSheet => ({ id, number: id, name: `Sheet ${id}`, createdAt: 0, viewports: [], titleBlock });
const input = (sheets: ProjectSheet[]): CheckInput => ({ views: [], sheets, drafts: [], planElements: () => [], elementExists: () => true });
const blocks = (f: Finding[]) => f.filter((x) => x.kind === 'titleBlockEmpty' || x.kind === 'titleBlockEmptyOnSheets');
const seven = () => Array.from({ length: 7 }, (_, i) => sheet(`A-${i}`, { project: 'P', date: '2026-10-13' }));

beforeEach(() => resetProject());

describe('a title-block field empty on several sheets', () => {
  it('is one finding with one fix, not one per sheet', () => {
    const f = checkSet(input(seven())).filter((x) => x.kind === 'titleBlockEmptyOnSheets');
    assert.equal(f.length, 1);
    assert.equal(f[0].params.count, 7);
    assert.equal(f[0].params.field, 'drawnBy');
    assert.equal(f[0].fill?.sheetIds.length, 7);
    assert.ok(!checkSet(input(seven())).some((x) => x.kind === 'titleBlockEmpty' && x.params.field === 'drawnBy'));
  });
  it('stays a finding on the sheet when only one sheet lacks it, and is listed first under the whole set', () => {
    const one = [sheet('a', { project: 'P', drawnBy: 'X', date: 'd' }), sheet('b', { project: 'P', date: 'd' })];
    assert.deepEqual(blocks(checkSet(input(one))).map((x) => [x.kind, x.sheetId]), [['titleBlockEmpty', 'b']]);
    const groups = groupBySheet(blocks(checkSet(input([...seven(), sheet('x', { project: 'P', drawnBy: 'X', date: 'd' }), sheet('y', { drawnBy: 'X', date: 'd' })]))), []);
    assert.equal(groups[0].findings[0].kind, 'titleBlockEmptyOnSheets');
  });
  it('is answered by one value: the empty sheets take it, a sheet with its own keeps it', () => {
    const sheets = [...seven(), sheet('own', { project: 'P', drawnBy: 'Mine', date: 'd' })];
    const r = fillTitleBlock(sheets, {}, 'drawnBy', ' P. Conduraru ');
    assert.equal(r.filled, 7);
    assert.equal(r.sheets.at(-1)?.titleBlock?.drawnBy, 'Mine');
    assert.ok(r.sheets.slice(0, 7).every((s) => s.titleBlock?.drawnBy === 'P. Conduraru'));
    assert.deepEqual(r.defaults, { drawnBy: 'P. Conduraru' });
    assert.deepEqual(blocks(checkSet(input(r.sheets))), []);
  });
  it('does nothing for an empty value', () => assert.equal(fillTitleBlock(seven(), {}, 'drawnBy', '  ').filled, 0));
  it('is kept as the project default: a sheet made later takes it', () => {
    useProjectStore.setState({ sheets: seven() });
    assert.equal(fillTitleBlockEverywhere('drawnBy', 'P. Conduraru'), 7);
    assert.equal(useProjectStore.getState().titleBlockDefaults?.drawnBy, 'P. Conduraru');
    const id = addProjectSheet('New');
    assert.equal(useProjectStore.getState().sheets.find((s) => s.id === id)?.titleBlock?.drawnBy, 'P. Conduraru');
  });
});
