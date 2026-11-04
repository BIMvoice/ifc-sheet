/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL planned through the engine alone on AC20-FZK-Haus (#707): the plan the engine draws gives the parts, `planDimAll` gives
 * the dimension strings with no session, no store and no browser; a second run with the first run's dimensions in place adds none.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanProjectView } from '../document.js';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from '../headless.js';
import { styleBookOf } from '../style-fit.js';
import { planDimAll, type DimAllInputs } from './dimall.js';
import { isDimAll } from './apply.js';
import { tableMeasure } from './measure.js';
import { planParts } from './parts.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus DIMALL test: ${missing}`);

describe.skipIf(missing !== null)('planDimAll on the plans of AC20-FZK-Haus (#707)', () => {
  let inputs: DimAllInputs;

  beforeAll(async () => {
    const model: OpenedModel = await openModel(new Uint8Array(readFileSync(FZK)));
    const set: DefaultSet | null = generateDefaultSet(model, { now: 0 });
    if (!set) throw new Error('no set: the model has no extent');
    const plans = set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    const view = plans.find((v) => planParts(drawings.get(v.id), model.buildingMeshes).some((p) => p.kind === 'wall'));
    if (!view) throw new Error('no plan of the house is cut through a wall');
    let n = 0;
    inputs = {
      viewId: view.id, layerId: 'l', placed: [], parts: planParts(drawings.get(view.id), model.buildingMeshes), rooms: [], obstacles: [],
      newId: () => `d${++n}`, book: styleBookOf(undefined, undefined), paperUnit: (view.scale ?? 100) / 1000, firstMm: undefined,
      settings: { textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard' },
      reader: { sectionLink: () => null, measure: tableMeasure }, rectsOf: () => [],
    };
  }, 300_000);

  it('draws strings round the house, stamped, with a message in translation keys', () => {
    const first = planDimAll(inputs);
    expect(first.add.length).toBeGreaterThan(0);
    expect(first.add.every((d) => d.shape.type === 'dimension' && isDimAll(d))).toBe(true);
    expect(first.messages[0].key).toBe('drafting.msg.dimAllDone');
    expect(first.messages[0].params?.count).toBe(first.add.length);
  });

  it('a second run with the first run in place adds nothing and says so', () => {
    const first = planDimAll(inputs);
    const again = planDimAll({ ...inputs, placed: first.add });
    expect(again.add).toEqual([]);
    expect(again.messages).toEqual([{ key: 'drafting.msg.dimAllHave' }]);
  });
});
