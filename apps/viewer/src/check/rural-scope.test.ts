/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The scope of the simplified PAC (Legea 169/2026 Anexa 3: P + M, 150 m² built gross area), against models made of numbers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerLocale, setLocale, resolve } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { urbanIndicators, type FootprintShape } from '@/urban/indicators';
import { describeRuralScope, ruralScopeFindings } from './rural-scope';

const rect = (w: number, d: number): FootprintShape[] => [{ outer: [[0, 0], [w, 0], [w, d], [0, d]], holes: [] }];
const result = (storeys: { name: string; elevation: number; w: number; d: number }[]) => urbanIndicators({
  storeys: storeys.map((s) => ({ name: s.name, elevation: s.elevation, footprint: rect(s.w, s.d) })), spaces: [], siteArea: 600,
});
const say = (locale: 'en' | 'ro', r: ReturnType<typeof result>) => { registerLocale('ro', ro); setLocale(locale); return ruralScopeFindings(r).map((f) => describeRuralScope(f, resolve, locale)); };

describe('the rural scope check', () => {
  it('a house of ground floor and attic, 10 x 7 m, is inside: no finding', () => {
    assert.deepEqual(ruralScopeFindings(result([{ name: 'P', elevation: 0, w: 10, d: 7 }, { name: 'M', elevation: 3, w: 10, d: 7 }])), []);
  });

  it('three levels above ground: the levels finding, in both languages', () => {
    const r = result([{ name: 'P', elevation: 0, w: 8, d: 6 }, { name: 'E1', elevation: 3, w: 8, d: 6 }, { name: 'E2', elevation: 6, w: 8, d: 6 }]);
    assert.deepEqual(say('en', r), ['The model has 3 levels above ground; the simplified PAC (Anexa 3) covers at most ground floor + attic.']);
    assert.deepEqual(say('ro', r), ['Modelul are 3 niveluri deasupra terenului; PAC simplificat (Anexa 3) acoperă cel mult parter + mansardă.']);
    setLocale('en');
  });

  it('a basement is not a level (the text names none) but its area is in Sd', () => {
    const r = result([{ name: 'S', elevation: -3, w: 10, d: 8 }, { name: 'P', elevation: 0, w: 10, d: 8 }, { name: 'M', elevation: 3, w: 10, d: 8 }]);
    // Two levels above ground: no levels finding. Sd = 3 x 80 = 240 m²: over 150.
    assert.deepEqual(ruralScopeFindings(r).map((f) => f.key), ['pac.rural.scope.area']);
  });

  it('Sd over 150 m² on two levels: the area finding with the figure, in both languages', () => {
    const r = result([{ name: 'P', elevation: 0, w: 10, d: 8.5 }, { name: 'M', elevation: 3, w: 10, d: 8.5 }]);
    assert.deepEqual(say('en', r), ['The model\'s built gross area (Sd) is 170.0 m²; the simplified PAC (Anexa 3) covers at most 150 m².']);
    assert.deepEqual(say('ro', r), ['Suprafața construită desfășurată a modelului (Sd) este 170,0 m²; PAC simplificat (Anexa 3) acoperă cel mult 150 m².']);
    setLocale('en');
  });

  it('exactly 150 m² is inside', () => {
    assert.deepEqual(ruralScopeFindings(result([{ name: 'P', elevation: 0, w: 10, d: 7.5 }, { name: 'M', elevation: 3, w: 10, d: 7.5 }])), []);
  });
});
