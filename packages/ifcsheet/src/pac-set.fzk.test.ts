/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The PAC set (#364) on AC20-FZK-Haus: the sheets Anexa 2 point 1.4.3 a) asks for, drawn at no forced scale (the text
 * says "o scară adecvată"), and the READ numeric scales of the sheets the model does not draw.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PAC_ITEMS, SET_SCALES, generateDefaultSet, pacCoverage, pacScaleAllowed, pacSetTemplate, type DefaultSet } from './index.js';
import { openModel, type OpenedModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
// The FZK model is committed (apps/viewer/src/test/__fixtures__): its absence is a broken checkout and fails below, it is not skipped.
// The wasm bundle is a build artefact: its absence skips, saying how to get it, as the other model tests do.
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the PAC set test: ${missing}`);

it('has the committed AC20-FZK-Haus fixture', () => {
  expect(existsSync(FZK), `${FZK} is committed; a missing file is a broken checkout`).toBe(true);
});

const NAMES = { name: 'PAC', plans: 'Planuri de nivel', facades: 'Fațade', sections: 'Secțiuni principale' };

describe.skipIf(missing !== null)('the PAC set of AC20-FZK-Haus (#364)', () => {
  let model: OpenedModel;
  let pac: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    pac = generateDefaultSet(model, { setTemplate: pacSetTemplate(NAMES), now: 0 })!;
  });

  it('lists the architecture sheets of Anexa 2 1.4.3 a) in order: plans, facades, sections', () => {
    const named = pac.document.sheets.filter((s) => Object.values(NAMES).includes(s.name)).map((s) => [s.name, s.series]);
    expect(named).toEqual([['Planuri de nivel', 'plans'], ['Fațade', 'elevations'], ['Secțiuni principale', 'sections']]);
  });

  it('puts the four facades on the facades sheet and the ground and upper storeys on the plans sheet', () => {
    const viewsOf = (name: string) => (pac.document.sheets.find((s) => s.name === name)?.viewports ?? []).map((vp) => pac.document.views.find((v) => v.id === vp.viewId));
    expect(viewsOf('Fațade').map((v) => (v?.kind === 'elevation' ? v.direction : null))).toEqual(['north', 'east', 'south', 'west']);
    expect(viewsOf('Planuri de nivel').every((v) => v?.kind === 'plan')).toBe(true);
    expect(viewsOf('Planuri de nivel').length).toBeGreaterThanOrEqual(2);
  });

  it('forces no scale on architecture: no slot asks for one and each sheet takes a scale the set fits', () => {
    expect(pacSetTemplate(NAMES).sheets.flatMap((r) => r.slots).every((slot) => slot.scale === undefined)).toBe(true);
    for (const item of PAC_ITEMS.filter((i) => i.drawnBy !== null)) expect(item.scales).toBeNull();
    const arch = pac.document.sheets.filter((s) => Object.values(NAMES).includes(s.name));
    for (const sheet of arch) {
      const scales = new Set((sheet.viewports ?? []).map((vp) => vp.scale));
      expect(scales.size, sheet.name).toBe(1);
      expect([...scales].every((sc) => (SET_SCALES as readonly number[]).includes(sc)), sheet.name).toBe(true);
    }
  });

  it('keeps the READ numeric scales for the sheets the model does not draw', () => {
    const scales = (id: string) => PAC_ITEMS.find((i) => i.id === id)?.scales;
    expect(scales('siteLocation')).toEqual([25000, 10000, 5000, 2000, 1000]);
    expect(scales('situationExisting')).toEqual([1000, 500]);
    expect(scales('situationProposed')).toEqual([1000, 500]);
    expect(scales('utilities')).toEqual([1000, 500]);
    const situation = PAC_ITEMS.find((i) => i.id === 'situationProposed')!;
    expect(pacScaleAllowed(situation, 500)).toBe(true);
    expect(pacScaleAllowed(situation, 100)).toBe(false);
  });

  it('puts a plan of every storey of the model on the plans sheet (FZK has two: the ground floor and the attic)', () => {
    const placed = new Set(pac.document.sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
    const planLevels = pac.document.views.filter((v) => v.kind === 'plan' && !v.site && placed.has(v.id)).map((v) => (v.kind === 'plan' ? v.level.name : ''));
    expect(pac.levels.length).toBe(2);
    expect(planLevels.length).toBe(pac.levels.length);
    expect(new Set(planLevels).size).toBe(2);
  });

  it('marks plans, facades and sections drawn for a new building, the other items to be supplied and point 1.4.4 not applicable', () => {
    const rows = pacCoverage(pac.document.sheets, { views: pac.document.views });
    expect(rows.filter((r) => r.state === 'yes').map((r) => r.item.id)).toEqual(['plans', 'facades', 'sections']);
    expect(rows.filter((r) => r.state === 'na').map((r) => r.item.id)).toEqual(['diagnosis', 'structuralExpertise', 'survey']);
    expect(pacCoverage([], { views: pac.document.views }).some((r) => r.drawn)).toBe(false);
  });
});
