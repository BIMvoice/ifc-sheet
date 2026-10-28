/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IssuePlan } from './plan.js';
import { drawingListCsv, issueFileNames } from './output.js';

const labels = { title: 'T', issue: 'Issue', date: 'Date', sheet: 'Sheet', sheetTitle: 'Title', scale: 'Scale', paper: 'Paper', revision: 'Rev', landscape: 'landscape', portrait: 'portrait', drawingList: 'drawing list' };

const planWith = (title: string, number = 'A-1'): IssuePlan =>
  ({
    name: 'P01',
    date: '2026-10-19',
    sheets: [{ row: { number, title, scale: '1:50', paper: 'A3', orientation: 'landscape', revision: '', fingerprint: '' } }],
    leftOut: [],
    changes: { status: 'first', against: null, added: [], removed: [], changed: [], unbumped: [] },
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

// #294: what leaves the app follows the language of the panel.
describe('issued text in Romanian', () => {
  const ro = { ...labels, issue: 'Emitere', paper: 'Format', landscape: 'orizontal', portrait: 'vertical', drawingList: 'lista de planse' };
  it('prints the paper orientation as a catalogue word', () => {
    assert.equal(secondLine(drawingListCsv(planWith('Parter'), ro)), 'A-1,Parter,1:50,A3 orizontal,,P01,2026-10-19');
    assert.equal(secondLine(drawingListCsv(planWith('Parter'), labels)), 'A-1,Parter,1:50,A3 landscape,,P01,2026-10-19');
  });
  it('names the issued files in the language, in plain ASCII, and keeps a typed name as typed', () => {
    assert.deepEqual(issueFileNames('Emitere 1', 'dxf', ro), { list: 'Emitere 1 lista de planse.csv', zip: 'Emitere 1 dxf.zip', pdf: 'Emitere 1.pdf', inZipList: 'lista-de-planse.csv' });
    assert.deepEqual(issueFileNames('Issue 1', 'svg', labels), { list: 'Issue 1 drawing list.csv', zip: 'Issue 1 svg.zip', pdf: 'Issue 1.pdf', inZipList: 'drawing-list.csv' });
    assert.equal(issueFileNames('Ediția 2', 'pdf', ro).pdf, 'Ediția 2.pdf');
  });
});
