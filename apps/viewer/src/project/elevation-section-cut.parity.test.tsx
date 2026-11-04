/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #627, the app against the engine on elevations and sections of AC20-FZK-Haus. Both cut every view the same way
 * (`viewCutOptions`: hidden edges classified, the Rust outline of non-extruded geometry), so the two drawings hold the same
 * lines per category and the same faces. The app's real path (`viewDrawing`) and `generateViewDrawings` draw the same
 * meshes; the rows ask for the hidden lines (`showHidden: true`) so that the classified lines are compared too. A side that
 * goes back to the unclassified cut draws no hidden line and another silhouette on the roof, and the rows fail.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { generateDefaultSet, storeyFloorsOf } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { TYPE_VISIBILITY_SEMANTIC_DEFAULTS } from '@/store/constants';
import { boundsOf, meshFile, viewDrawing } from '@/test/view-drawing-harness';
import type { ElevationProjectView, ProjectLevel, ProjectView, SectionProjectView } from './types';

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);

const counts = (d: Drawing2D) => {
  // The app's elevation draws the building's outline as `silhouette` (`drawingAsViewShows`, styling the engine has not taken over): the same lines.
  const by = (category: string) => d.lines.filter((l) => (l.category === 'silhouette' ? 'projection' : l.category) === category).length;
  const categories = [...new Set(d.lines.map((l) => (l.category === 'silhouette' ? 'projection' : l.category)))].sort();
  return {
    lines: d.lines.length,
    hidden: d.lines.filter((l) => l.visibility === 'hidden').length,
    byCategory: Object.fromEntries(categories.map((c) => [c, by(c)])),
    cutPolygons: d.cutPolygons.length,
    projectionPolygons: d.projectionPolygons.length,
  };
};

interface Loaded { geometry: GeometryResult; model: OpenedModel; levels: readonly ProjectLevel[]; elevations: ElevationProjectView[] }

describe('elevations and sections of FZK, app against engine (#627)', () => {
  let l: Loaded | null = null;
  before(async () => {
    const geometry = await meshFile(FZK);
    if (!geometry) return;
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model);
    assert.ok(set, 'a default set');
    l = { geometry, model, levels: set.levels, elevations: set.document.views.filter((v): v is ElevationProjectView => v.kind === 'elevation' && !v.interior) };
  });

  async function row(t: { skip: (m: string) => void }, make: (b: NonNullable<ReturnType<typeof boundsOf>>) => Exclude<ProjectView, { kind: '3d' }>) {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const view = make(boundsOf(l.geometry)!);
    const hierarchy = l.model.dataStore.spatialHierarchy;
    const app = await viewDrawing(view, l.geometry, hierarchy, { ...TYPE_VISIBILITY_SEMANTIC_DEFAULTS, site: false });
    assert.ok(app, 'the app drew nothing');
    // The engine gets the app's bounds here, not `model.extent` (the building's meshes only): the automatic depth is half the
    // extent along the cut, so a site wider than the building makes the two depths differ. That is a separate difference.
    const floors = storeyFloorsOf(l.model.buildingMeshes, hierarchy);
    const engine = (await generateViewDrawings([view], l.model.buildingMeshes, l.levels, boundsOf(l.geometry)!, undefined, undefined, floors)).get(view.id);
    assert.ok(engine, 'the engine drew nothing');
    const a = counts(app);
    assert.ok(a.hidden > 0, 'the app classifies hidden lines on this view, or the row proves nothing');
    assert.deepEqual(counts(engine), a);
  }

  const base = { createdAt: 0, showHidden: true };
  // The default set's elevations stand where the app puts them: outside the facade by its clearance (`planeOffset`).
  for (const direction of ['south', 'north', 'east', 'west'] as const) {
    it(`FZK ${direction} elevation`, (t) => row(t, () => {
      const v = l?.elevations.find((e) => e.direction === direction);
      assert.ok(v, 'the default set has the elevation');
      return { ...v, ...base, id: `fzk-${direction}` };
    }));
  }
  it('FZK section across the house (z axis)', (t) => row(t, (b) => {
    const v: SectionProjectView = { ...base, id: 'fzk-sec-z', name: 'section', kind: 'section', plane: { axis: 'front', offset: (b.min.z + b.max.z) / 2 + 0.0731, flipped: false } };
    return v;
  }));
  it('FZK section along the house (x axis)', (t) => row(t, (b) => {
    const v: SectionProjectView = { ...base, id: 'fzk-sec-x', name: 'section', kind: 'section', plane: { axis: 'side', offset: (b.min.x + b.max.x) / 2 + 0.0731, flipped: false } };
    return v;
  }));
});
