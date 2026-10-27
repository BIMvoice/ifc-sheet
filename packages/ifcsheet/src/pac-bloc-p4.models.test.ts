/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The "Done when" of #364 on the demo model bloc-p4 (five storeys): the PAC set template applied, the Anexa 2 checklist
 * run and the submission package built, the way `ifcsheet build --pac` does it. The package is the opis first, then the
 * plans, facades and sections; the checklist's missing items are written out below, each one absent from the model by
 * nature (site plans, the roof plan, the memos and the specialty parts are supplied by the person, not drawn from IFC).
 * Legea 169/2026 replaced the DTAC by the PAC; "DTAC" in the issue reads as PAC.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PAC_ITEMS, PAC_OPIS_ORDER, PAC_WORDS_RO, generateDefaultSet, pacApplies, pacCoverage, pacOpisOf, type DefaultSet } from './index.js';
import { openModel, readinessOfModel, sheetGraphics } from './headless.js';
import { pacPages, pacTemplateFor } from './cli-pac.js';
import type { SheetGraphic } from './sheet-graphic.js';

const BLOC = fileURLToPath(new URL('../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the bloc-p4 PAC test: ${missing}`);

it('has the committed bloc-p4 demo model', () => {
  expect(existsSync(BLOC), `${BLOC} is committed; a missing file is a broken checkout`).toBe(true);
});

describe.skipIf(missing !== null)('the PAC set on bloc-p4: the ordered package and the checklist (#364)', () => {
  let set: DefaultSet;
  let pages: SheetGraphic[];
  let findings: ReturnType<typeof readinessOfModel>;

  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(BLOC)));
    set = generateDefaultSet(model, { setTemplate: pacTemplateFor('ro'), locale: 'ro' })!;
    pages = pacPages(await sheetGraphics(set, model, {}), set, 'ro');
    findings = readinessOfModel(model);
  }, 120_000);

  it('applies the template: a plan of each of the five storeys, then the facades and the sections', () => {
    const plans = set.document.sheets.find((s) => s.series === 'plans')!;
    const levels = (plans.viewports ?? []).map((vp) => {
      const view = set.document.views.find((v) => v.id === vp.viewId);
      return view?.kind === 'plan' ? view.level.name : null;
    });
    expect(levels).toEqual(['Parter', 'Etaj 1', 'Etaj 2', 'Etaj 3', 'Etaj 4']);
    expect(set.document.sheets.map((s) => s.series)).toEqual(['plans', 'elevations', 'sections']);
  });

  it('builds the package with the opis first, then the sheets in set order', () => {
    expect(pages.map((p) => p.sheetId)).toEqual(['pac-opis', ...set.document.sheets.map((s) => s.id)]);
    expect(pages.map((p) => p.name)).toEqual([PAC_WORDS_RO['pac.opis.title'], 'Planuri de nivel', 'Fațade', 'Secțiuni principale']);
    expect(pages.map((p) => p.number)).toEqual(['', 'A-101', 'A-201', 'A-301']);
    expect(pages[0].texts.length).toBeGreaterThan(0);
  });

  it('lists the Anexa 2 items in PAC_OPIS_ORDER, those that apply to a new building', () => {
    const opis = pacOpisOf({ name: set.document.name, sheets: set.document.sheets, views: set.document.views, titleBlock: set.document.titleBlock }, 'ro');
    expect(opis.rows.map((r) => r.id)).toEqual([...PAC_OPIS_ORDER]);
    // Written out in the order Anexa 2 numbers them (1.1 to 1.3, 1.4.2, 1.4.3, 1.4.4, 1.5, 1.6.1 to 1.6.5), so a reorder of PAC_OPIS_ORDER fails here.
    expect(opis.rows.map((r) => r.id)).toEqual([
      'siteLocation', 'situationExisting', 'situationProposed', 'architectureMemo', 'plans', 'roof', 'facades', 'sections', 'context',
      'diagnosis', 'structuralExpertise', 'survey', 'utilities', 'specialtyMemos', 'neighbourExpertise', 'geotechnical', 'calculationBrief', 'engineeringDrawings',
    ]);
    const applies = PAC_ITEMS.filter((i) => pacApplies(i, 'new')).map((i) => i.id);
    expect(opis.rows.filter((r) => r.state !== 'na').map((r) => r.id)).toEqual(PAC_OPIS_ORDER.filter((id) => applies.includes(id)));
    // The opis page prints the same rows: each answer is on the page.
    const printed = pages[0].texts.map((t) => t.text);
    expect(printed.filter((t) => t === opis.yes)).toHaveLength(opis.rows.filter((r) => r.state === 'yes').length);
    expect(printed.filter((t) => t === opis.no)).toHaveLength(opis.rows.filter((r) => r.state === 'no').length);
  });

  it('runs the checklist: exactly these items are missing, written out', () => {
    const rows = pacCoverage(set.document.sheets, { views: set.document.views });
    const byOrder = (state: string) => PAC_OPIS_ORDER.filter((id) => rows.find((r) => r.item.id === id)!.state === state);
    // Drawn from the model.
    expect(byOrder('yes')).toEqual(['plans', 'facades', 'sections']);
    // Missing: what the person supplies (the site and situation plans, the memo, the roof plan, the context photos, the utilities, the specialty parts).
    expect(byOrder('no')).toEqual([
      'siteLocation', 'situationExisting', 'situationProposed', 'architectureMemo', 'roof', 'context',
      'utilities', 'specialtyMemos', 'neighbourExpertise', 'geotechnical', 'calculationBrief', 'engineeringDrawings',
    ]);
    // Point 1.4.4 is for works on an existing building.
    expect(byOrder('na')).toEqual(['diagnosis', 'structuralExpertise', 'survey']);
    expect(rows.find((r) => r.item.id === 'plans')!.missingStoreys).toEqual([]);
  });

  it('flags the room areas as estimated (the model states no NetFloorArea)', () => {
    expect(findings.filter((f) => f.kind === 'estimatedAreas').map((f) => f.params.count)).toEqual([90]);
  });
});
