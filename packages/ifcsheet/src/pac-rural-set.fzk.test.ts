/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The simplified rural PAC set (#364, Legea 169/2026 Anexa 3) on AC20-FZK-Haus: the sheets of point 8 a) at 1:50, and
 * the checklist with the point numbers of the official text.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PAC_RURAL_ITEMS, generateDefaultSet, pacCoverage, pacRuralSetTemplate, type DefaultSet } from './index.js';
import { openModel, type OpenedModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the rural PAC set test: ${missing}`);

const NAMES = { name: 'PAC simplificat', plans: 'Planuri de nivel', facades: 'Fațade', sections: 'Secțiuni principale' };

describe('the Anexa 3 checklist (#364)', () => {
  it('carries the point numbers of the official text, in its order', () => {
    expect(PAC_RURAL_ITEMS.map((i) => [i.id, i.point])).toEqual([
      ['rural.siteLocation', '1 a)'], ['rural.situationExisting', '1 b), 2'], ['rural.situationProposed', '1 c), 3'], ['rural.utilities', '1 d), 4'],
      ['rural.plans', '1 e), 8 a)'], ['rural.roof', '1 e), 8 a)'], ['rural.facades', '1 e), 8 a)'], ['rural.sections', '1 e), 8 a)'],
      ['rural.context', '1 e), 8 b)'], ['rural.fencePlans', '1 f), 8 c)'], ['rural.memo', '6 a), 7'], ['rural.survey', '9 a)'], ['rural.structuralExpertise', '9 b)'],
    ]);
  });

  it('names 1:50 for the drawings of 8 a) and 1:1.000 or 1:500 for the three situation plans', () => {
    const scales = (id: string) => PAC_RURAL_ITEMS.find((i) => i.id === id)?.scales;
    for (const id of ['rural.plans', 'rural.roof', 'rural.facades', 'rural.sections']) expect(scales(id), id).toEqual([50]);
    for (const id of ['rural.situationExisting', 'rural.situationProposed', 'rural.utilities']) expect(scales(id), id).toEqual([1000, 500]);
    expect(scales('rural.siteLocation')).toBeNull();
  });
});

const EXPECTED_PAPERS: [string, string][] = [
  ['Planuri de nivel 1', 'A2'], ['Planuri de nivel 2', 'A2'],
  ['Fațade 1', 'A3'], ['Fațade 2', 'A3'], ['Fațade 3', 'A3'], ['Fațade 4', 'A3'],
  ['Secțiuni principale 1', 'A3'], ['Secțiuni principale 2', 'A3'],
];

describe.skipIf(missing !== null)('the rural PAC set of AC20-FZK-Haus (#364)', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  const arch = () => set.document.sheets.filter((s) => Object.values(NAMES).some((n) => s.name.startsWith(n)) && s.series !== 'schedules');

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    set = generateDefaultSet(model, { setTemplate: pacRuralSetTemplate(NAMES), now: 0 })!;
  });

  it('lists plans, facades, sections in order, one sheet per drawing', () => {
    const named = arch().map((s) => [s.name, s.series]);
    expect(named.length).toBeGreaterThanOrEqual(6);
    expect(named.map(([, series]) => series)).toEqual([...named.map(([, series]) => series)].sort((a, b) => ['plans', 'elevations', 'sections'].indexOf(a as string) - ['plans', 'elevations', 'sections'].indexOf(b as string)));
    expect(new Set(named.map(([n]) => n)).size).toBe(named.length);
  });

  it('draws every drawing slot at 1:50, one viewport per sheet, A3 where it fits and a larger paper where it does not', () => {
    expect(pacRuralSetTemplate(NAMES).sheets.flatMap((r) => r.slots).every((slot) => slot.scale === 50)).toBe(true);
    for (const sheet of arch()) {
      expect(sheet.viewports, sheet.name).toHaveLength(1);
      expect(sheet.viewports![0].scale, sheet.name).toBe(50);
    }
    // FZK is larger than the Anexa 3 scope: its plans do not fit the A3 drawing area (400 x 227 mm, drawing plus
    // 25 mm clearances and title) at 1:50, so they step up to A2; its facades and sections fit A3. The exact sizes the
    // rule yields are pinned; the 12 m house on A3 is in pac-rural-set.test.ts.
    expect(arch().map((s) => [s.name, s.paper])).toEqual(EXPECTED_PAPERS);
  });

  it('marks plans, facades and sections drawn and the rest to be supplied', () => {
    expect(pacCoverage(set.document.sheets, PAC_RURAL_ITEMS).filter((r) => r.drawn).map((r) => r.item.id)).toEqual(['rural.plans', 'rural.facades', 'rural.sections']);
  });
});
