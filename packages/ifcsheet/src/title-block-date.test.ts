/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { formatTitleBlockDate } from './title-block-date.js';
import { fieldBuiltins } from './title-block-params.js';
import { sheetLookup } from './title-block-print.js';

describe('formatTitleBlockDate (#426)', () => {
  it('writes a Romanian date dd.mm.yyyy', () => {
    expect(formatTitleBlockDate('2026-10-27', 'ro')).toBe('27.10.2026');
    expect(formatTitleBlockDate('2026-01-05', 'ro-RO')).toBe('05.01.2026');
  });
  it('leaves English, an unknown language and a hand-typed date as they are', () => {
    expect(formatTitleBlockDate('2026-10-27', 'en')).toBe('2026-10-27');
    expect(formatTitleBlockDate('2026-10-27', undefined)).toBe('2026-10-27');
    expect(formatTitleBlockDate('27 Oct 2026', 'ro')).toBe('27 Oct 2026');
    expect(formatTitleBlockDate('', 'ro')).toBe('');
  });
  it('is applied to the Date and ReportDate built-ins by the one builder the app and the engine both read', () => {
    const fields = { date: '2026-10-27', reportDate: '2026-03-02' };
    expect(fieldBuiltins(fields, 'ro')).toMatchObject({ Date: '27.10.2026', ReportDate: '02.03.2026' });
    expect(fieldBuiltins(fields)).toMatchObject({ Date: '2026-10-27', ReportDate: '2026-03-02' });
  });
  it('reaches the engine sheet lookup', () => {
    const sheet = { id: 's1', number: 'A-01', name: 'Plan' } as ProjectSheet;
    const doc = { name: 'Casa', sheets: [sheet], titleBlock: { date: '2026-10-27' } } as unknown as ProjectDocument;
    expect(sheetLookup(sheet, doc, '1:100', undefined, 'ro')('Date')).toBe('27.10.2026');
    expect(sheetLookup(sheet, doc, '1:100')('Date')).toBe('2026-10-27');
  });
});
