/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #269: the levels the urban sheet's rule lines quote (the terrain level and
 * the model elevation of ±0.00, which the catalogue fills into its sentence as
 * parameters) are written in the sheet's language, and so is the site source
 * note's plot area.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import type { UrbanIndicators } from '@/urban/indicators';
import { useSiteSourceNote, useUrbanLabels } from './useUrban';

const RESULT = {
  storeys: [{ name: 'EG', elevation: 0, height: 2.7, builtArea: 120, usefulArea: 99, belowGround: false, ground: true, inCut: true, inCutByDefault: true, unmeasured: 0 }],
  terrainLevel: -1.5, zero: { elevation: 12.345, source: 'model' },
} as unknown as UrbanIndicators;

function Rules() {
  const labels = useUrbanLabels('T', null);
  const note = useSiteSourceNote();
  return <pre data-rules>{[...labels.rules(RESULT), note({ source: 'typed', area: 600, plot: 1234.5, typed: 600, model: null })].join('\n')}</pre>;
}

describe('the urban rule lines quote levels in the sheet\'s language (#269)', () => {
  afterEach(() => { cleanup(); act(() => setLocale('en')); });

  it('Română writes the terrain level, the model\'s ±0.00 and the plot area with a comma', () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    const text = render(<Rules />).querySelector('[data-rules]')?.textContent ?? '';
    assert.match(text, /-1,50/, text);
    assert.match(text, /12,35/, text);
    assert.match(text, /1\.234,50/, text);
    assert.doesNotMatch(text, /-1\.50|12\.35/, text);
  });

  it('English keeps the point', () => {
    const text = render(<Rules />).querySelector('[data-rules]')?.textContent ?? '';
    assert.match(text, /-1\.50/, text);
    assert.match(text, /12\.35/, text);
    assert.match(text, /1,234\.50/, text);
  });
});
