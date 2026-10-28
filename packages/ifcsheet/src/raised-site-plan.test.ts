/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model that keeps its real height in the site's placement (the public
 * Skolebygg sample: IfcSite.RefElevation 131.2 m) is meshed at that height,
 * while its storeys' `Elevation` stays relative (0.0 and 3.0 m). The headless
 * engine took each level's floor from `Elevation` alone, so every plan cut at
 * 1.2 m passed 130 m below the building and every plan sheet came out empty;
 * the web app took the floor from the storey's placement (`ProjectLevel.floorY`).
 *
 * The fixture is the #226 one (Nivel 1 at 0.0 m with four walls, Nivel 2 at
 * 3.0 m with a slab) with its site placement raised by 131.2 m.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { openModel, sheetGraphics, type OpenedModel, type SheetGraphic } from './headless.js';

const FIXTURE = fileURLToPath(new URL('../../../apps/viewer/src/project/__fixtures__/plan-cut-above-top.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FIXTURE) ? 'plan-cut-above-top.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the raised-site plan test: ${missing}`);

const SITE_Z = 131.2;
const ORIGIN = '#101=IFCCARTESIANPOINT((0.,0.,0.));';

describe.skipIf(missing !== null)('a plan of a model whose site sits above the origin, from Node', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let sheets: SheetGraphic[];

  beforeAll(async () => {
    const text = readFileSync(FIXTURE, 'utf8');
    if (!text.includes(ORIGIN)) throw new Error('the fixture no longer has the site origin the test raises');
    model = await openModel(new TextEncoder().encode(text.replace(ORIGIN, `#101=IFCCARTESIANPOINT((0.,0.,${SITE_Z}));`)));
    set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 24) })!;
    sheets = await sheetGraphics(set, model);
  }, 120_000);

  it('meshes the model at the site height, with the storeys still relative', () => {
    expect(model.extent!.min.y).toBeCloseTo(SITE_Z, 3);
    expect(model.storeys.map((s) => s.elevation).sort()).toEqual([0, 3]);
  });

  it('puts each level\'s floor at its placement in the meshes\' frame, not at its Elevation', () => {
    expect(model.storeys.map((s) => s.floorY).sort()).toEqual([SITE_Z, SITE_Z + 3].map((y) => expect.closeTo(y, 3)));
    expect(set.levels.map((l) => l.floorY).sort()).toEqual([SITE_Z, SITE_Z + 3].map((y) => expect.closeTo(y, 3)));
  });

  it('draws the walls on the plan of the lower level, cut at its own floor plus 1.2 m', () => {
    const plan = set.document.views.find((v) => v.kind === 'plan' && v.name === 'Nivel 1')!;
    const sheet = sheets.find((s) => s.viewports.some((vp) => vp.viewId === plan.id))!;
    expect(sheet.cut.length).toBeGreaterThanOrEqual(4);
  });
});
