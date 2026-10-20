/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Drawing2DGenerator, createSectionConfig } from '@ifc-lite/drawing-2d';
import { GeometryProcessor } from '@ifc-lite/geometry';

/**
 * Issue #49 added two options to the drawing engine (feature edges, an edge
 * tolerance in the hidden-line pass) for the axonometric. Plans, sections and
 * elevations do not pass them, and must draw exactly what they drew before:
 * these are the primitive counts of AC20-FZK-Haus on `main` at e5459e2 (the
 * same generation run through a build of that tree's engine drew the same
 * lines, line for line).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FZK = join(ROOT, 'tests', 'models', 'ara3d', 'AC20-FZK-Haus.ifc');
const WASM = join(ROOT, 'packages', 'wasm', 'pkg', 'ifc-lite_bg.wasm');

const ON_MAIN = {
  plan: { axis: 'y', position: 1.2, lines: 2194, hidden: 999, polygons: 229 },
  section: { axis: 'z', position: 0, lines: 2643, hidden: 2304, polygons: 58 },
  elevation: { axis: 'z', position: 20, lines: 474, hidden: 447, polygons: 0 },
} as const;

describe('plans, sections and elevations of FZK-Haus draw what they drew on main', () => {
  for (const [name, expected] of Object.entries(ON_MAIN)) {
    it(`${name}: ${expected.lines} lines, ${expected.hidden} hidden, ${expected.polygons} cut polygons`, async (t) => {
      if (!existsSync(FZK) || !existsSync(WASM)) return t.skip('run pnpm fixtures and pnpm build:wasm:fetch');
      const bytes = readFileSync(FZK);
      const processor = new GeometryProcessor();
      let meshes;
      try {
        await processor.init();
        meshes = (await processor.process(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))).meshes;
      } finally {
        processor.dispose();
      }
      const generator = new Drawing2DGenerator();
      try {
        await generator.initialize();
        const config = createSectionConfig(expected.axis, expected.position, {
          projectionDepth: 20, projectionBelowDepth: 20, projectionAboveDepth: 20, includeHiddenLines: true, scale: 100,
        });
        const drawing = await generator.generate(meshes, config, { useGPU: false, includeHiddenLines: true, includeProjection: true, includeEdges: true, mergeLines: true });
        assert.deepEqual(
          [drawing.lines.length, drawing.lines.filter((l) => l.visibility === 'hidden').length, drawing.cutPolygons.length],
          [expected.lines, expected.hidden, expected.polygons],
        );
      } finally {
        generator.dispose();
      }
    });
  }
});
