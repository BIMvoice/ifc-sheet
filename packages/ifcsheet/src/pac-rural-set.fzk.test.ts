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

describe.skipIf(missing !== null)('the rural PAC set of AC20-FZK-Haus (#364)', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    set = generateDefaultSet(model, { setTemplate: pacRuralSetTemplate(NAMES), now: 0 })!;
  });

  it('lists plans, facades, sections in order', () => {
    const named = set.document.sheets.filter((s) => Object.values(NAMES).includes(s.name)).map((s) => [s.name, s.series]);
    expect(named).toEqual([['Planuri de nivel', 'plans'], ['Fațade', 'elevations'], ['Secțiuni principale', 'sections']]);
  });

  it('draws every drawing slot at 1:50', () => {
    expect(pacRuralSetTemplate(NAMES).sheets.flatMap((r) => r.slots).every((slot) => slot.scale === 50)).toBe(true);
    const arch = set.document.sheets.filter((s) => Object.values(NAMES).includes(s.name));
    expect(arch.flatMap((s) => s.viewports ?? []).length).toBeGreaterThanOrEqual(8);
    for (const sheet of arch) for (const vp of sheet.viewports ?? []) expect(vp.scale, sheet.name).toBe(50);
  });

  it('marks plans, facades and sections drawn and the rest to be supplied', () => {
    expect(pacCoverage(set.document.sheets, PAC_RURAL_ITEMS).filter((r) => r.drawn).map((r) => r.item.id)).toEqual(['rural.plans', 'rural.facades', 'rural.sections']);
  });
});
