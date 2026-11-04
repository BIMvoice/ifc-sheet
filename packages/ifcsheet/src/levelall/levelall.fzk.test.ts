/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LEVELALL planned through the engine alone on AC20-FZK-Haus (#707): the sections and elevations the engine draws give the elements,
 * `planLevelAll` gives the level marks with no session, no store and no browser; a second run with the first run's marks in place adds none.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet } from '../default-set.js';
import type { ProjectView } from '../document.js';
import { generateViewDrawings, openModel } from '../headless.js';
import { viewElements } from '../labels/view-elements.js';
import { planLevelAll, type LevelAllInputs } from './levelall.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus LEVELALL test: ${missing}`);

describe.skipIf(missing !== null)('planLevelAll on a view of AC20-FZK-Haus (#707)', () => {
  let inputs: LevelAllInputs;

  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set) throw new Error('no set: the model has no extent');
    const views = set.document.views.filter((v: ProjectView) => v.kind === 'section' || v.kind === 'elevation');
    const drawings = await generateViewDrawings(views, model.buildingMeshes, set.levels, model.extent!);
    const view = views.find((v) => drawings.has(v.id) && viewElements(drawings.get(v.id)!).length > 0);
    if (!view) throw new Error('no section or elevation with elements');
    let n = 0;
    inputs = {
      kind: view.kind as 'section' | 'elevation', elements: viewElements(drawings.get(view.id)!), levels: set.levels, existing: [], rectsOf: () => [],
      placement: { viewId: view.id, layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: (view.scale ?? 100) / 1000 },
      styled: () => ({}), newId: () => `m${++n}`,
    };
  }, 300_000);

  it('marks the levels and the top, with its message as a translation key', () => {
    const first = planLevelAll(inputs);
    expect(first.add.length).toBeGreaterThan(0);
    expect(first.add.every((d) => d.shape.type === 'level' && typeof d.params.levelAll === 'string')).toBe(true);
    expect(first.messages[0].key).toMatch(/^drafting\.msg\.levelAllDone(Left|Right)$/);
  });

  it('a second run with the first run in place adds nothing and says so', () => {
    const first = planLevelAll(inputs);
    const again = planLevelAll({ ...inputs, existing: first.add });
    expect(again.add).toEqual([]);
    expect(again.messages[0]).toEqual({ key: 'drafting.msg.levelAllHave', params: { count: first.add.length } });
  });

  it('a plan gets the view-only message', () => {
    expect(planLevelAll({ ...inputs, kind: 'plan' }).messages[0].key).toBe('drafting.msg.levelAllViewOnly');
  });
});
