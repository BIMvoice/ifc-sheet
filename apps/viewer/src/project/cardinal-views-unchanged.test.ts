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
 *
 * The section's counts were re-recorded for #749 (2643 lines, 58 cut polygons before). Its plane z = 0 lies on faces of
 * many of these raw meshes, and a vertex on the plane now counts on the side the section does not look at: faces on the
 * plane whose solid lies behind it are no longer cut, and triangles with a vertex on the plane are cut through it, so the
 * railing's balusters and the site close as polygons.
 *
 * Re-pinned, with the committed copy of FZK (apps/viewer/src/test/__fixtures__), which CI can read. The test read
 * tests/models, which CI never fetches, so it skipped there and two moves went unseen. Each is an intended drawing
 * change; the old value is kept here (lines, hidden, cut polygons):
 *  - #768 (4aa632d87), an edge lying on the outline of a surface in front of it is drawn whole: it no longer comes out
 *    as visible and hidden pieces, so fewer lines. plan 2194, 999, 229 became 2145, 967, 229; section 2622, 2304, 64
 *    became 2625, 2304, 64 (short pieces of edges the same flicker had cut out are back); elevation unchanged.
 *  - #779 (e1134ddc2), an element drawn from its mesh outline is hidden behind what lies in front of it along its whole
 *    length (FZK's rafters): plan 2145, 967, 229 became 2139, 965, 229; section 2625, 2304, 64 became 2616, 2307, 64
 *    (rafters under the roof slab turn hidden); elevation 474, 447, 0 became 481, 451, 0.
 * Bisected: both counts passed at 09f26cf71, the parent of #768, and no other commit since touched the drawing engine.
 *  - #557 (fix/stair-section), the outline of a curved surface runs along its smooth edges and is drawn where the
 *    surface folds over: this test passes no outline provider, so every element is drawn from its silhouette, and the
 *    handrails, rails, the stair's column and its helical stringer gain their long lines. plan 2139, 965, 229 became
 *    2332, 1097, 229; section 2616, 2307, 64 became 2863, 2554, 64; elevation 481, 451, 0 became 494, 464, 0. A curved
 *    line takes its depth from the faces it lies on only, so one behind its own element's front stays hidden.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
// The committed copy, so the viewer CI job runs this test (it never fetches tests/models).
const FZK = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', '__fixtures__', 'AC20-FZK-Haus.ifc');
const WASM = join(ROOT, 'packages', 'wasm', 'pkg', 'ifc-lite_bg.wasm');

const ON_MAIN = {
  plan: { axis: 'y', position: 1.2, lines: 2332, hidden: 1097, polygons: 229 },
  section: { axis: 'z', position: 0, lines: 2863, hidden: 2554, polygons: 64 },
  elevation: { axis: 'z', position: 20, lines: 494, hidden: 464, polygons: 0 },
} as const;

describe('plans, sections and elevations of FZK-Haus draw what they drew on main', () => {
  for (const [name, expected] of Object.entries(ON_MAIN)) {
    it(`${name}: ${expected.lines} lines, ${expected.hidden} hidden, ${expected.polygons} cut polygons`, async (t) => {
      if (!existsSync(FZK) || !existsSync(WASM)) return t.skip('needs the wasm runtime (pnpm build:wasm:fetch)');
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
