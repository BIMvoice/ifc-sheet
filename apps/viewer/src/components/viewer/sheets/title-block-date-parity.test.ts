/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { sheetLookup, type ProjectDocument } from '@bimvoice/ifcsheet';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet } from '@/project/types';
import { sheetParamLookup } from './useSheetParams';

// The screen and the engine's PDF write the title block's date through one formatter (#426): same sheet, same date, both languages.
describe('the title block date on screen and in the engine (#426)', () => {
  const sheet = { id: 's1', number: 'A-01', name: 'Plan' } as ProjectSheet;
  const fields = { date: '2026-10-27' };
  const screen = (language: string | undefined) => sheetParamLookup(sheet, {
    projectFields: fields, projectName: 'Casa', params: [], sheets: [sheet], schedules: [], revisions: [], drafts: [], scale: '1:100', ...(language ? { language } : {}),
  } as Parameters<typeof sheetParamLookup>[1])('Date');
  const engine = (language: string | undefined) => sheetLookup(sheet as never, { name: 'Casa', sheets: [sheet], titleBlock: fields } as unknown as ProjectDocument, '1:100', undefined, language)('Date');

  it('agree in Romanian: dd.mm.yyyy', () => {
    assert.equal(screen('ro'), '27.10.2026');
    assert.equal(engine('ro'), '27.10.2026');
  });
  it('agree in English: as stored', () => {
    assert.equal(screen('en'), '2026-10-27');
    assert.equal(engine('en'), '2026-10-27');
  });
});
