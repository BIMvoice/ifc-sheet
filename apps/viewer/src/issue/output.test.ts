/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IssuePlan } from './plan.js';
import { drawingListCsv } from './output.js';

const labels = { title: 'T', issue: 'Issue', date: 'Date', sheet: 'Sheet', sheetTitle: 'Title', scale: 'Scale', paper: 'Paper', revision: 'Rev' };

const planWith = (title: string, number = 'A-1'): IssuePlan =>
  ({
    name: 'P01',
    date: '2026-10-19',
    sheets: [{ row: { number, title, scale: '1:50', paper: 'A3', orientation: 'landscape', revision: '', fingerprint: '' } }],
    leftOut: [],
  }) as unknown as IssuePlan;

const secondLine = (csv: string) => csv.split('\r\n')[1];

describe('drawingListCsv escaping', () => {
  it('quotes commas, quotes and line breaks, doubling inner quotes', () => {
    assert.equal(secondLine(drawingListCsv(planWith('Plan, "ground"'), labels)), 'A-1,"Plan, ""ground""",1:50,A3 landscape,,P01,2026-10-19');
    assert.ok(drawingListCsv(planWith('two\nlines'), labels).includes('"two\nlines"'));
    assert.ok(drawingListCsv(planWith('cr\rhere'), labels).includes('"cr\rhere"'));
  });

  it('leaves a plain cell bare and ends every line with CRLF', () => {
    const csv = drawingListCsv(planWith('Ground floor'), labels);
    assert.equal(secondLine(csv), 'A-1,Ground floor,1:50,A3 landscape,,P01,2026-10-19');
    assert.ok(csv.endsWith('\r\n'));
  });

  it('defuses a spreadsheet formula in a title (CWE-1236)', () => {
    for (const lead of ['=', '+', '-', '@']) {
      assert.ok(secondLine(drawingListCsv(planWith(`${lead}SUM(A1)`), labels)).includes(`'${lead}SUM(A1)`), lead);
    }
  });
});
