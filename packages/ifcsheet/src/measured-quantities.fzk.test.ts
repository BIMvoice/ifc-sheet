/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Quantities measured from geometry (#74) through the real pipeline (parser
 * and wasm geometry), against figures stated independently:
 * - AC20-FZK-Haus with its Qto sets ignored: each wall's and slab's measured
 *   volume against the NetVolume ArchiCAD wrote, within 1% (the issue's
 *   "manual check"); slab top areas against NetArea; wall side areas against
 *   NetSideArea where the wall has no opening, and between NetSideArea and
 *   GrossSideArea where it has (ArchiCAD subtracts about 0.3 m² more per
 *   opening than the hole the cut mesh has, so the two disagree by up to 3.2%
 *   there; the volume, which counts the same holes, agrees within 0.6%).
 * - A millimetre model built for this test: the same metres and cubic metres
 *   as its dimensions say, the window cut out of the wall's volume and side.
 * - A real FZK wall moved 5 000 km away: the same volume.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { extractQuantitiesOnDemand } from '@ifc-lite/parser';
import { openModel, type OpenedModel } from './headless.js';
import { measureElement } from './measured-quantities.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const MM = fileURLToPath(new URL('./__fixtures__/millimetre-wall-slab.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found in apps/viewer/src/test/__fixtures__'
  : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch` (or `bash scripts/build-wasm.sh`)' : null;
if (missing) console.warn(`[ifcsheet] skipping the measured-quantities model test: ${missing}`);

const piecesById = (meshes: readonly MeshData[]): Map<number, MeshData[]> => {
  const by = new Map<number, MeshData[]>();
  for (const m of meshes) (by.get(m.expressId) ?? by.set(m.expressId, []).get(m.expressId)!).push(m);
  return by;
};

/** Relative difference, signed. */
const delta = (measured: number, declared: number): number => measured / declared - 1;

describe.skipIf(missing !== null)('measured quantities on real models (#74)', () => {
  let fzk: OpenedModel;
  let fzkPieces: Map<number, MeshData[]>;
  /** The FZK walls and slabs with their declared Qto figures, by express id. */
  let checked: { id: number; className: string; name: string; q: Record<string, number> }[];

  beforeAll(async () => {
    fzk = await openModel(new Uint8Array(readFileSync(FZK)));
    fzkPieces = piecesById(fzk.meshes);
    const ds = fzk.dataStore;
    checked = [...fzkPieces.keys()].flatMap((id) => {
      const className = ds.entities.getTypeName(id) ?? '';
      if (!/^Ifc(WallStandardCase|Wall|Slab)$/.test(className)) return [];
      const q = Object.fromEntries((extractQuantitiesOnDemand(ds, id) ?? []).flatMap((s) => s.quantities.map((x) => [x.name, x.value] as const)));
      return [{ id, className, name: ds.entities.getName(id), q }];
    });
  }, 120_000);

  it('measures every FZK wall and slab volume within 1% of the NetVolume the model states', () => {
    expect(checked.filter((c) => c.className === 'IfcWallStandardCase').length).toBe(13);
    expect(checked.filter((c) => c.className === 'IfcSlab').length).toBe(4);
    for (const c of checked) {
      const m = measureElement(c.className, fzkPieces.get(c.id)!);
      expect(m.volume.value, `${c.name}: ${m.volume.refusal}`).not.toBeNull();
      expect(Math.abs(delta(m.volume.value!, c.q.NetVolume)), `${c.name}: ${m.volume.value} m³ against ${c.q.NetVolume}`).toBeLessThan(0.01);
    }
  });

  it('measures each FZK slab top within 1% of its NetArea, the cut-out one included', () => {
    for (const c of checked.filter((x) => x.className === 'IfcSlab')) {
      const m = measureElement(c.className, fzkPieces.get(c.id)!);
      expect(Math.abs(delta(m.area!.value!, c.q.NetArea)), `${c.name}: ${m.area?.value} m² against ${c.q.NetArea}`).toBeLessThan(0.01);
    }
    // Slab-033 has a stair hole: net, not gross.
    const cut = checked.find((c) => c.name === 'Slab-033')!;
    expect(cut.q.GrossArea - cut.q.NetArea).toBeGreaterThan(10);
  });

  it('measures each FZK wall side: within 1% of NetSideArea without openings, between net and gross with them', () => {
    let plain = 0;
    for (const c of checked.filter((x) => x.className === 'IfcWallStandardCase')) {
      const area = measureElement(c.className, fzkPieces.get(c.id)!).area!.value!;
      if (c.q.NetSideArea === c.q.GrossSideArea) {
        plain++;
        expect(Math.abs(delta(area, c.q.NetSideArea)), `${c.name}: ${area} m² against ${c.q.NetSideArea}`).toBeLessThan(0.01);
      } else {
        expect(area, c.name).toBeGreaterThanOrEqual(c.q.NetSideArea * 0.99);
        expect(area, c.name).toBeLessThan(c.q.GrossSideArea);
      }
    }
    expect(plain).toBeGreaterThanOrEqual(5);
  });

  it('refuses the FZK railings, whose meshes are open', () => {
    const railings = [...fzkPieces].filter(([id]) => fzk.dataStore.entities.getTypeName(id) === 'IfcRailing');
    expect(railings.length).toBe(2);
    for (const [, pieces] of railings) expect(measureElement('IfcRailing', pieces).volume.refusal).toBe('notClosed');
  });

  it('gives a real FZK wall the same volume 5 000 km away', () => {
    const wall = checked.find((c) => c.name === 'Wand-Ext-ERDG-1')!;
    const pieces = fzkPieces.get(wall.id)!;
    const here = measureElement(wall.className, pieces);
    // The same triangles in f64, moved: positions far from the origin, and the same shift carried by the mesh origin instead.
    const shift = [4_500_000, 312, -5_200_000];
    const moved = pieces.map((p) => ({ indices: p.indices, positions: Float64Array.from(p.positions, (v, i) => v + (p.origin?.[i % 3] ?? 0) + shift[i % 3]) }));
    const reOriginated = pieces.map((p) => ({ ...p, origin: [0, 1, 2].map((k) => (p.origin?.[k] ?? 0) + shift[k]) }));
    for (const far of [measureElement(wall.className, moved), measureElement(wall.className, reOriginated)]) {
      expect(Math.abs(far.volume.value! - here.volume.value!)).toBeLessThan(1e-6);
      expect(Math.abs(far.area!.value! - here.area!.value!)).toBeLessThan(1e-6);
    }
  });

  it('measures a millimetre model in cubic and square metres, the window cut out', async () => {
    const mm = await openModel(new Uint8Array(readFileSync(MM)));
    const by = piecesById(mm.meshes);
    const of = (cls: string) => {
      const id = [...by.keys()].find((i) => mm.dataStore.entities.getTypeName(i) === cls)!;
      return measureElement(cls, by.get(id)!);
    };
    const wall = of('IfcWall'), slab = of('IfcSlab');
    // 5 x 3 x 0.3 m less a 1 x 1.2 m window through it.
    expect(wall.volume.value).toBeCloseTo(4.5 - 0.36, 4);
    expect(wall.area?.value).toBeCloseTo(15 - 1.2, 4);
    // 4 x 3 x 0.2 m.
    expect(slab.volume.value).toBeCloseTo(2.4, 4);
    expect(slab.area?.value).toBeCloseTo(12, 4);
  }, 120_000);
});
