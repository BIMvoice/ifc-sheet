/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities' summary on a sheet writes its quantities through the project's "Units and numbers" setting
 * (#88), as every other figure on a sheet does, not by the language alone.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boqSayFor, computeBoq, newArticle, type BoqElement } from '@bimvoice/ifcsheet';
import { sheetFormat } from '@bimvoice/ifcsheet/names';
import { layoutBoq, type BoqSheetLabels } from './boq-layout';

const DOOR: BoqElement = {
  modelId: 'm', expressId: 1, globalId: 'g1', name: 'D1', ifcClass: 'IfcDoor', predefinedType: null, typeClass: 'IfcDoorType', typeName: 'Door',
  level: 'EG', materials: [], properties: [], quantities: [],
};
// One counted element times a factor: the article's total is 1234.5678.
const RESULT = computeBoq([DOOR], [{ ...newArticle('a', 'buc'), code: 'A1', description: 'Doors', typeName: 'Door', factor: 1234.5678 }]);
const printed = (locale: BoqSheetLabels['locale']): string[] =>
  layoutBoq(RESULT, { locale, title: 'T', say: boqSayFor('en'), detail: false }).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));

describe('the bill of quantities on a sheet follows the project\'s units and numbers (#88)', () => {
  it('writes the total in the language, and in the separator and grouping the project sets', () => {
    assert.ok(printed('en').includes('1,234.57'), printed('en').join('|'));
    assert.ok(printed('ro').includes('1.234,57'));
    assert.ok(printed(sheetFormat('en', { separator: 'comma' })).includes('1.234,57'));
    assert.ok(printed(sheetFormat('en', { group: false })).includes('1234.57'));
  });
});
