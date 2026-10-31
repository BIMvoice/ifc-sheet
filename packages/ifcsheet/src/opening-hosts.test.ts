/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #586, the engine half: a window hosted in a wall the plan cuts is drawn on the plan, as its symbol, though its sill is above the cut.
 * The app's twin is `apps/viewer/src/project/opening-hosts-parity.test.ts`, the same fixture. `__fixtures__/host-wall-window.ifc`:
 * Level 0 (cut 1.2 m) holds a 3 m wall (#48) with a window (#75) over 1.5 to 2.1 m in it, and an unhosted window (#83) at the same height.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import type { PlanProjectView, ProjectLevel } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, sectionConfigFor, type OpenedModel } from './headless.js';
import { hostedInCutWall, openingHostsOf, storeyMembersOf } from './opening-hosts.js';
import { planOpeningSymbols } from './plan-openings.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';

export const FIXTURE = fileURLToPath(new URL('./__fixtures__/host-wall-window.ifc', import.meta.url));
const WALL = 48, HOSTED = 75, FREE = 83;

const mesh = (expressId: number, ifcType: string, y0: number, y1: number): MeshData => ({ expressId, ifcType, positions: new Float32Array([0, y0, 0, 1, y1, 0, 0, y1, 1]) }) as MeshData;

describe('hostedInCutWall (#586)', () => {
  const meshes = [mesh(1, 'IfcWall', 0, 3), mesh(2, 'IfcWallStandardCase', 0, 1), mesh(3, 'IfcSlab', 0, 3)];
  const hosts = new Map([[10, 1], [11, 2], [12, 3]]);
  const test = hostedInCutWall(meshes, (id) => hosts.get(id), () => true);
  it('is true for an element whose host wall spans the cut', () => expect(test(10, 1.2)).toBe(true));
  it('is false when the host wall ends under the cut, or the element has no host, or the host is not a wall', () => {
    expect(test(11, 1.2)).toBe(false);
    expect(test(13, 1.2)).toBe(false);
    expect(test(12, 1.2)).toBe(false);
  });
  it('is false for an element of another storey, though its host wall spans the cut', () => {
    expect(hostedInCutWall(meshes, (id) => hosts.get(id), (id) => id !== 10)(10, 1.2)).toBe(false);
  });
});

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the host wall test: ${missing}`);

describe.skipIf(missing !== null)('a window in a wall the plan cuts is on the plan (#586)', () => {
  let model: OpenedModel;
  let symbols: ReturnType<typeof planOpeningSymbols>;
  let drawnIds: Set<number>;
  let projectedIds: Set<number>;
  let levels: ProjectLevel[];

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === 'Level 0')!;
    const drawing = (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent)).get(view.id)!;
    levels = set.levels;
    // What the cut drew: its faces and its lines, not the projection (a one-level plan also draws what is overhead, as the app does, #615).
    drawnIds = new Set([...drawing.cutPolygons, ...drawing.lines.filter((l) => l.category !== 'projection')].map((e) => e.entityId));
    projectedIds = new Set(drawing.lines.filter((l) => l.category === 'projection').map((l) => l.entityId));
    const plane = sectionConfigFor(view, set.levels, model.extent)!.plane;
    symbols = planOpeningSymbols(model.buildingMeshes, plane, { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } }, undefined, view.level);
  }, 120_000);

  it('the premise: the cut passes through the wall, and under both windows', () => {
    expect(drawnIds.has(WALL)).toBe(true);
    expect(drawnIds.has(HOSTED)).toBe(false);
    expect(drawnIds.has(FREE)).toBe(false);
  });

  it('the unhosted window above the cut is only in the projection lines, on this one-level plan, as the app draws it (#615)', () => {
    expect(levels).toHaveLength(1);
    expect(projectedIds.has(FREE)).toBe(true);
  });

  it('reads the window\'s host wall through its opening', () => {
    expect([...openingHostsOf(model.dataStore)]).toEqual([[HOSTED, WALL]]);
  });

  it('shows the hosted window as its symbol, with shapes', () => {
    const own = symbols.filter((s) => s.id === HOSTED);
    expect(own).toHaveLength(1);
    expect(own[0].kind).toBe('window');
    expect(own[0].shapes.length).toBeGreaterThan(0);
  });

  it('keeps the unhosted window above the cut hidden', () => {
    expect(symbols.map((s) => s.id)).toEqual([HOSTED]);
  });
});

const TWO = fileURLToPath(new URL('./__fixtures__/host-wall-two-storeys.ifc', import.meta.url));
const TALL_WALL = 48, LOWER_DOOR = 75, UPPER_WINDOW = 93;

/** The two-storey twin (#586): a 6 m wall of Level 0 hosts a door on Level 0 and a window on Level 1, and both plans cut it. */
describe.skipIf(missing !== null)('the host-wall rule draws only the plan\'s own storey (#586)', () => {
  let model: OpenedModel;
  const symbolsOf = async (name: string) => {
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === name)!;
    const drawing = (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent)).get(view.id)!;
    const plane = sectionConfigFor(view, set.levels, model.extent)!.plane;
    const sources = { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } };
    return { drawnIds: new Set([...drawing.cutPolygons, ...drawing.lines].map((e) => e.entityId)), ids: planOpeningSymbols(model.buildingMeshes, plane, sources, undefined, view.level).map((s) => s.id) };
  };

  beforeAll(async () => { model = await openModel(new Uint8Array(readFileSync(TWO))); }, 120_000);

  it('the premise: both plans cut the double-height wall, and the hosts are read', async () => {
    expect((await symbolsOf('Level 0')).drawnIds.has(TALL_WALL)).toBe(true);
    expect((await symbolsOf('Level 1')).drawnIds.has(TALL_WALL)).toBe(true);
    expect([...openingHostsOf(model.dataStore)].sort()).toEqual([[LOWER_DOOR, TALL_WALL], [UPPER_WINDOW, TALL_WALL]]);
  });

  it('Level 0 draws its door, and not the window of Level 1 that its wall also hosts', async () => {
    expect((await symbolsOf('Level 0')).ids).toEqual([LOWER_DOOR]);
  });

  it('Level 1 draws its window above the cut, and not the door of Level 0', async () => {
    expect((await symbolsOf('Level 1')).ids).toEqual([UPPER_WINDOW]);
  });

  it('a storey\'s members are what the plans are framed by', () => {
    const level1 = storeyMembersOf(model.dataStore, ['3hostTwoLevel00000002']);
    expect([...level1]).toEqual([UPPER_WINDOW]);
  });
});
