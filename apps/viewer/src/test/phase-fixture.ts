/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The FZK-Haus with phases (`public/_fixtures/AC20-FZK-Haus-phases.ifc`, made by
 * `tools/phase-fixture/make-phase-fixture.mjs`) as a test loads it: parsed into the
 * viewer store (a single model, so a drawing's entity ids are express ids), its real
 * meshes from the wasm geometry pass, and the drawings of a plan, a section and an
 * elevation made by the drawing generator on the CPU. Import `@/test/setup-dom.js` first.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { GeometryProcessor, type MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator, type Drawing2D, type SectionConfig } from '@ifc-lite/drawing-2d';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';

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
  draw: (kind: 'plan' | 'section' | 'elevation') => Promise<Drawing2D>;
}

let loaded: Promise<PhaseModel> | null = null;

/** Parse, seed the store, run the geometry: once per test process. */
export function loadPhaseModel(file = 'AC20-FZK-Haus-phases.ifc'): Promise<PhaseModel> {
  return (loaded ??= (async () => {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/_fixtures', file)));
    const store = await parseStep(bytes);
    seedModel('fzk', 0, store, 1);
    // The DOM shim's fetch cannot read a file: URL, so the wasm is handed over as bytes.
    const wasm = await import('@ifc-lite/wasm');
    wasm.initSync({ module: readFileSync(createRequire(import.meta.url).resolve('@ifc-lite/wasm/ifc-lite_bg.wasm')) });
    const processor = new GeometryProcessor();
    await processor.init();
    const { meshes } = await processor.process(bytes);
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
      draw: (kind) => generator.generate(meshes, config(kind), { useGPU: false, mergeLines: true, includeProjection: kind !== 'plan', includeEdges: kind !== 'plan', includeHiddenLines: false }),
    };
  })());
}
