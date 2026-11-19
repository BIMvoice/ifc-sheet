/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #830: with two models loaded, a door draws one symbol. AC20-FZK-Haus is federated with a copy of itself (the copy's ids offset as
 * the federation offsets them), the worst case: every door and window twice at the same place. The plans' symbols are counted per
 * element against FZK alone, with the same GlobalIds, with the copy's GlobalIds unknown (the footprint decides), and with the copy
 * read as a structural model moved off the building (the discipline decides). The discipline of real models is read from their
 * content; the ones under `tests/models` skip when absent (`pnpm fixtures`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { IfcParser } from '@ifc-lite/parser';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { openingSymbols } from './opening-symbols.js';
import { symbolMeshes, type OpeningSource } from './opening-owners.js';
import { disciplineOfName, modelDisciplineOf, type ModelDiscipline } from './model-discipline.js';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const FZK = at('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc');
const WASM = at('../../wasm/pkg/ifc-lite_bg.wasm');
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
/** The copy's ids are offset past FZK's, as `FederationRegistry` re-homes a second model. */
const OFFSET = 1_000_000;

const copyOf = (meshes: readonly MeshData[], shiftX = 0): MeshData[] => meshes.map((m) => ({
  ...m, expressId: m.expressId + OFFSET, origin: [(m.origin?.[0] ?? 0) + shiftX, m.origin?.[1] ?? 0, m.origin?.[2] ?? 0],
}) as MeshData);

describe.skipIf(missing !== null)('one symbol per door when AC20-FZK-Haus is federated with itself (#830)', () => {
  let model: OpenedModel;
  let planes: SectionPlaneConfig[];

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model);
    if (!set) throw new Error('no set');
    const plans = set.document.views.filter((v) => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    planes = plans.map((v) => drawings.get(v.id)!.config.plane);
  }, 120_000);

  /** Symbols per element over every plan, keyed by FZK's own id (a copy's symbol counts for the element it copies). */
  const perElement = (meshes: readonly MeshData[]): Map<number, number> => {
    const n = new Map<number, number>();
    for (const plane of planes) for (const s of openingSymbols(meshes, plane)) n.set(s.id % OFFSET, (n.get(s.id % OFFSET) ?? 0) + 1);
    return n;
  };
  const guid = (id: number) => model.dataStore.entities.getGlobalId(id % OFFSET) || undefined;
  const source = (discipline: ModelDiscipline, guids: boolean) => (id: number): OpeningSource => id >= OFFSET
    ? { model: 'copy', discipline, order: 1, ...(guids ? { globalId: guid(id) } : {}) }
    : { model: 'fzk', discipline: 'architectural', order: 0, globalId: guid(id) };

  it('reads FZK as architectural', () => expect(modelDisciplineOf(model.dataStore, 'AC20-FZK-Haus.ifc')).toBe('architectural'));

  it('draws every door and window once, as FZK alone draws them, though two models hold it', () => {
    const alone = perElement(model.buildingMeshes);
    expect([...alone.values()].every((n) => n === 1), 'FZK alone: one symbol per element').toBe(true);
    expect(alone.size, 'FZK alone draws its doors and windows').toBeGreaterThan(10);
    const both = [...model.buildingMeshes, ...copyOf(model.buildingMeshes)];
    // Without the rule each element draws twice: the duplicate leaves and swings of #830.
    expect([...perElement(both).values()].every((n) => n === 2)).toBe(true);

    const sameGuids = perElement(symbolMeshes(both, source('architectural', true), ['architectural', 'architectural']));
    expect(sameGuids, 'the same GlobalId draws once').toEqual(alone);
    const otherGuids = perElement(symbolMeshes(both, source('architectural', false), ['architectural', 'architectural']));
    expect(otherGuids, 'the same door at the same place draws once').toEqual(alone);
  });

  it('draws no door or window of a structural model while an architectural one is loaded', () => {
    const alone = perElement(model.buildingMeshes);
    // Moved 5 m: no door of the copy is at the place of FZK's, so only the discipline leaves them out.
    const both = [...model.buildingMeshes, ...copyOf(model.buildingMeshes, 5)];
    expect(perElement(symbolMeshes(both, source('structural', false), ['architectural', 'structural']))).toEqual(alone);
    // A structural model alone with another structural one keeps its doors (one copy each).
    expect(perElement(symbolMeshes(both, source('structural', false), ['structural', 'structural']))).toEqual(new Map([...alone].map(([id]) => [id, 2])));
  });

  it('leaves one model as it is', () => {
    expect(symbolMeshes(model.buildingMeshes, source('architectural', true), ['architectural'])).toBe(model.buildingMeshes);
  });
});

const DISCIPLINES: Array<[string, ModelDiscipline]> = [
  ['../../../apps/viewer/src/test/fixtures/federated/arch.ifc', 'architectural'],
  ['../../../apps/viewer/src/test/fixtures/federated/str.ifc', 'structural'],
  ['../../../tests/models/various/01_BIMcollab_Example_ARC.ifc', 'architectural'],
  ['../../../tests/models/various/02_BIMcollab_Example_STR_random_C_ebkp.ifc', 'structural'],
  ['../../../tests/models/various/01_Snowdon_Towers_Sample_Structural(1).ifc', 'structural'],
  ['../../../tests/models/buildingsmart/Building-Structural.ifc', 'structural'],
  ['../../../tests/models/buildingsmart/Building-Architecture.ifc', 'architectural'],
  ['../../../tests/models/buildingsmart/Building-Hvac.ifc', 'mep'],
];

describe('the discipline of a model is read from its content (#830)', () => {
  for (const [path, expected] of DISCIPLINES) {
    const file = at(path);
    it.skipIf(!existsSync(file))(`${path.split('/').pop()} is ${expected}`, async () => {
      const bytes = readFileSync(file);
      const store = await new IfcParser().parseColumnar(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      expect(modelDisciplineOf(store, path.split('/').pop())).toBe(expected);
    }, 120_000);
  }

  it('reads a discipline from a file name only when its tokens name one', () => {
    expect(disciplineOfName('Project_S_Level1.ifc')).toBe('structural');
    expect(disciplineOfName('HOUSE-KON-01.ifc')).toBe('structural');
    expect(disciplineOfName('house-ARK.ifc')).toBe('architectural');
    expect(disciplineOfName('Strasse.ifc')).toBeNull();
    expect(disciplineOfName('ARCH-STR.ifc')).toBeNull();
  });
});
