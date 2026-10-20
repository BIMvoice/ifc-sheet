/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The FZK-Haus with phases (made from `tests/models/ara3d/AC20-FZK-Haus.ifc`, fetched by
 * `pnpm fixtures`, by `phase-fixture-source.ts` as it loads) as a test loads it: parsed into the
 * viewer store (a single model, so a drawing's entity ids are express ids), its real
 * meshes from the wasm geometry pass, and the drawings of a plan, a section and an
 * elevation made by the drawing generator on the CPU. Import `@/test/setup-dom.js` first.
 * Without the fixture or the wasm runtime, `phaseModelMissing()` says why, and the tests skip.
 */

import { existsSync, readFileSync } from 'node:fs';
import { GeometryProcessor, type MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator, type Drawing2D, type SectionConfig } from '@ifc-lite/drawing-2d';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { withPhaseStatus } from '@/test/phase-fixture-source.js';

const SAMPLE = new URL('../../../../tests/models/ara3d/AC20-FZK-Haus.ifc', import.meta.url);
const WASM = new URL('../../../../packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url);

/** Why the phase model cannot be made here (the skip message), or null when it can. */
export function phaseModelMissing(): string | null {
  if (!existsSync(SAMPLE)) return 'FZK-Haus fixture not fetched: run `pnpm fixtures`';
  if (!existsSync(WASM)) return 'wasm bundle not built: run `pnpm build:wasm:fetch` (or `bash scripts/build-wasm.sh`) first';
  return null;
}

/** Express ids of the fixture's walls, by the Status the generator gave them. */
export const WALL = {
  existing: [21966, 32407, 31470],
  demolish: 18465,
  new: 17040,
  /** Carries no Status at all (nor does its type). */
  none: 27421,
} as const;

export interface PhaseModel {
  meshes: MeshData[];
  /** Plane position of a plan cut 1.2 m above the ground floor (viewer frame, Y up). */
  cutY: number;
  /** `hidden`: express ids left out of the generator's input, as a view's phases do (`phaseHiddenIds`). */
  draw: (kind: 'plan' | 'section' | 'elevation', hidden?: ReadonlySet<number> | null) => Promise<Drawing2D>;
}

let loaded: Promise<PhaseModel> | null = null;

/** Parse, seed the store, run the geometry: once per test process. Check `phaseModelMissing()` first. */
export function loadPhaseModel(): Promise<PhaseModel> {
  return (loaded ??= (async () => {
    const missing = phaseModelMissing();
    if (missing) throw new Error(missing);
    const sample = readFileSync(SAMPLE, 'latin1');
    const bytes = new Uint8Array(Buffer.from(withPhaseStatus(sample), 'latin1'));
    const store = await parseStep(bytes);
    seedModel('fzk', 0, store, 1);
    // The DOM shim's fetch cannot read a file: URL, so the wasm is handed over as bytes.
    const wasm = await import('@ifc-lite/wasm');
    wasm.initSync({ module: readFileSync(WASM) });
    const processor = new GeometryProcessor();
    await processor.init();
    // Type-library geometry (IfcSpaceType…) is no part of a model view, as the viewer's drawing hook also drops it.
    const meshes = (await processor.process(bytes)).meshes.filter((m) => !/Type$/.test(m.ifcType ?? ''));
    const ground = meshes.find((m) => m.expressId === WALL.none)!;
    const ys = ground.positions.filter((_, i) => i % 3 === 1);
    const floor = Math.min(...ys) + (ground.origin?.[1] ?? 0);
    const cutY = floor + 1.2;
    const generator = new Drawing2DGenerator();
    await generator.initialize();
    const bounds = meshes.reduce((b, m) => {
      for (let i = 0; i < m.positions.length; i += 3) {
        const o = m.origin ?? [0, 0, 0];
        for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], m.positions[i + k] + o[k]); b.max[k] = Math.max(b.max[k], m.positions[i + k] + o[k]); }
      }
      return b;
    }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const config = (kind: 'plan' | 'section' | 'elevation'): SectionConfig => {
      const mid = (k: number) => (bounds.min[k] + bounds.max[k]) / 2;
      const plane = kind === 'plan' ? { axis: 'y' as const, position: cutY, flipped: false } : kind === 'section' ? { axis: 'x' as const, position: mid(0), flipped: false } : { axis: 'z' as const, position: bounds.max[2] - 0.01, flipped: false };
      return { plane, projectionDepth: kind === 'plan' ? 1.2 : 30, projectionBelowDepth: 30, projectionAboveDepth: 0.001, includeHiddenLines: true, creaseAngle: 30, scale: 100 };
    };
    return {
      meshes, cutY,
      draw: (kind, hidden) => generator.generate(hidden ? meshes.filter((m) => !hidden.has(m.expressId)) : meshes, config(kind), { useGPU: false, mergeLines: true, includeProjection: kind !== 'plan', includeEdges: kind !== 'plan', includeHiddenLines: false }),
    };
  })());
}
