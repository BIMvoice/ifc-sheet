/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Federated models on the Wall (#96), end to end over the hand-written pair
 * (`test/fixtures/federated/`): an architecture model (walls, a door) and a
 * structure model (a column, a slab) authored in the same project coordinates
 * ~2,600 km from the file origin, the structure reaching them through an
 * IfcSite and a building placement that cancel. Each file meshes with its own
 * RTC offset (0.45 m apart), so the column lands in the walls' inner corner
 * only if the federation frame is applied all the way to the drawing.
 *
 * Plans are drawn by the real `ViewDrawingHost` and printed with the sheet's
 * own `viewportPens`.
 */

import '@/test/setup-dom.js';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { viewportPens } from '@/components/viewer/sheets/viewport-pens';
import { ViewSvg } from '@/components/viewer/drafting/view-dxf';
import { cleanup, render } from '@/test/render';
import { ARCH, STR, WASM_BUILT, drawView, loadFederatedPair, planOf, type LoadedPair } from '@/test/federated-pair';
import { entityStyles, setHostModel, setModelDrawStyle } from './model-styles';
import { useProjectStore } from './project-store';

const skip = WASM_BUILT ? false : 'wasm runtime not built (pnpm build:wasm or pnpm build:wasm:fetch)';
const MM = 0.001;
const T = { scale: 1, x: 0, y: 0 };
const HALFTONE_INK = '#999999';
const HALFTONE_FILL = '#eeeeef';

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function cutBox(drawing: Drawing2D, entityId: number): Box {
  const pts = drawing.cutPolygons.filter((p) => p.entityId === entityId).flatMap((p) => p.polygon.outer);
  assert.ok(pts.length > 0, `entity ${entityId} has a cut polygon`);
  return {
    minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
  };
}

const ids = (drawing: Drawing2D) => new Set([...drawing.cutPolygons, ...drawing.lines].map((x) => x.entityId));
const only = (drawing: Drawing2D, keep: (entityId: number) => boolean): Drawing2D => ({
  ...drawing, cutPolygons: drawing.cutPolygons.filter((p) => keep(p.entityId)), lines: drawing.lines.filter((l) => keep(l.entityId)),
});
const styleNow = () => entityStyles(useViewerStore.getState(), useProjectStore.getState().models);

describe('federated models on the Wall (#96)', { skip }, () => {
  let pair: LoadedPair;
  let level0: Drawing2D;
  let level1: Drawing2D;
  before(async () => {
    pair = await loadFederatedPair();
    level0 = await drawView(planOf('Level 0'));
    level1 = await drawView(planOf('Level 1'));
  });

  it('a plan draws both models, the linked one in halftone', () => {
    const drawn = ids(level0);
    for (const id of [ARCH.wallA, ARCH.wallB, ARCH.door, pair.strId(STR.column)]) assert.ok(drawn.has(id), `entity ${id} is in the Level 0 plan`);

    const styleOf = styleNow();
    assert.ok(styleOf, 'two models loaded: the linked one has a style');
    const column = pair.strId(STR.column);
    const strPens = viewportPens(only(level0, (id) => id === column), undefined, T, 'down', [], styleOf);
    const archPens = viewportPens(only(level0, (id) => id === ARCH.wallA || id === ARCH.wallB), undefined, T, 'down', [], styleOf);
    assert.deepEqual([...new Set(strPens.filter((p) => p.stroke).map((p) => p.stroke))], [HALFTONE_INK]);
    assert.deepEqual([...new Set(strPens.filter((p) => p.fill).map((p) => p.fill))], [HALFTONE_FILL]);
    assert.deepEqual([...new Set(archPens.filter((p) => p.stroke).map((p) => p.stroke))], ['#000000']);
    assert.deepEqual([...new Set(archPens.filter((p) => p.fill).map((p) => p.fill))], ['#d4d4d8']);
    // Weights are the category's, untouched: the same cut pen width for both models.
    assert.deepEqual(strPens.filter((p) => p.layer === 'CUT').map((p) => p.width), archPens.filter((p) => p.layer === 'CUT').map((p) => p.width));
  });

  it('the view\'s DXF draws the linked model in halftone, like the sheet', () => {
    // What `viewDxf` hands the DXF walker (which needs a browser's path geometry, so it writes nothing here).
    const host = render(<ViewSvg view={planOf('Level 0')} drawing={level0} axis="down" drafts={[]} layers={[]} extraPatterns={[]} overlays={[]} />);
    try {
      const strokes = new Set([...host.querySelectorAll('path')].map((p) => p.getAttribute('stroke')));
      assert.ok(strokes.has(HALFTONE_INK), `halftone ink: ${[...strokes].join(', ')}`);
      assert.ok(strokes.has('#000000'), 'the host stays in full ink');
    } finally {
      cleanup();
    }
  });

  it('the style is the project\'s: a normal linked model, or the structure made host, draws in full ink', () => {
    const column = pair.strId(STR.column);
    try {
      setModelDrawStyle('str.ifc', 'normal');
      assert.equal(styleNow(), undefined);
      setModelDrawStyle('str.ifc', 'halftone');
      setHostModel('str.ifc');
      const styleOf = styleNow();
      assert.equal(styleOf?.(column), 'halftone', 'an explicit halftone stays with the model');
      assert.equal(styleOf?.(ARCH.wallA), 'halftone', 'the architecture, now linked, goes halftone by default');
    } finally {
      useProjectStore.setState({ models: useProjectStore.getState().models.map(({ key, name }) => ({ key, name })) });
    }
    assert.equal(styleNow()?.(ARCH.wallA), undefined);
  });

  it('the column sits in the walls\' inner corner, despite its own site placement and RTC offset', () => {
    const column = cutBox(level0, pair.strId(STR.column));
    const wallA = cutBox(level0, ARCH.wallA); // along +X; plan y is IFC -y, so its inner face is its minY
    const wallB = cutBox(level0, ARCH.wallB); // along +Y; inner face at its maxX
    assert.ok(Math.abs(column.minX - wallB.maxX) < MM, `column x ${column.minX} vs wall B face ${wallB.maxX}`);
    assert.ok(Math.abs(column.maxY - wallA.minY) < MM, `column y ${column.maxY} vs wall A face ${wallA.minY}`);
    assert.ok(Math.abs(column.maxX - column.minX - 0.3) < MM && Math.abs(column.maxY - column.minY - 0.3) < MM, 'a 0.3 m column');
  });

  it('a column touching two walls of the other model keeps its own outline, and so do the walls', () => {
    const column = pair.strId(STR.column);
    const cutLines = (id: number) => level0.lines.filter((l) => l.entityId === id && l.category === 'cut');
    assert.equal(level0.cutPolygons.filter((p) => p.entityId === column).length, 1);
    assert.equal(cutLines(column).length, 4, 'the column\'s four cut edges');
    // Wall B's inner face (x = 0.3) runs past the column: the shared stretch is still drawn by the wall.
    assert.ok(cutLines(ARCH.wallB).some((l) => Math.abs(l.line.start.x - 0.3) < MM && Math.abs(l.line.end.x - 0.3) < MM), 'wall B keeps its inner face');
    assert.ok(cutLines(ARCH.wallA).some((l) => Math.abs(l.line.start.y + 0.3) < MM && Math.abs(l.line.end.y + 0.3) < MM), 'wall A keeps its inner face');
  });

  it('levels match by elevation across models; a level the linked model lacks still draws its geometry in the cut range', () => {
    const levels = useProjectStore.getState().levels;
    const level0Level = levels.find((l) => l.name === 'Level 0');
    const level1Level = levels.find((l) => l.name === 'Level 1');
    assert.equal(levels.length, 2, 'Level 0 and Structure L0 (both at 0 m) are one level');
    assert.deepEqual(level0Level?.storeyGlobalIds.sort(), ['2fedArchLevel000000100', '2fedStrLevel0000000100']);
    assert.deepEqual(level1Level?.storeyGlobalIds, ['2fedArchLevel100000100'], 'the structure has no storey at 3 m');
    // The 6 m column, contained in the structure's only storey, crosses Level 1's cut: it is drawn there.
    const drawn = ids(level1);
    assert.ok(drawn.has(ARCH.wallC));
    assert.ok(level1.cutPolygons.some((p) => p.entityId === pair.strId(STR.column)), 'the column is cut on Level 1');
  });
});

describe('federated models at a real elevation: the plan cut follows the meshes\' frame (#96)', { skip }, () => {
  let pair: LoadedPair;
  let level0: Drawing2D;
  let level1: Drawing2D;
  before(async () => {
    // Sites at +250 / +260 m (the latter's building at -10 m), Elevation written as 250 / 253 m: each file
    // meshes with an RTC offset whose Z is 250 m, so `Elevation + cutHeight` alone would cut 250 m too high.
    pair = await loadFederatedPair({ elevated: true });
    level0 = await drawView(planOf('Level 0'));
    level1 = await drawView(planOf('Level 1'));
  });

  it('levels keep the authored elevations and gain their floor in the drawing frame', () => {
    const levels = useProjectStore.getState().levels;
    assert.deepEqual(levels.map((l) => [l.name, l.elevation]), [['Level 1', 253], ['Level 0', 250]]);
    const frameZ = useViewerStore.getState().models.get('arch')?.geometryResult?.coordinateInfo.wasmRtcOffset?.z;
    assert.equal(frameZ, 250, 'the fixture meshes against a 250 m vertical RTC offset');
    assert.ok(Math.abs((levels.find((l) => l.name === 'Level 0')?.floorY ?? NaN) - 0) < MM);
    assert.ok(Math.abs((levels.find((l) => l.name === 'Level 1')?.floorY ?? NaN) - 3) < MM);
  });

  it('Level 0 cuts the walls, the door and the column, in the walls\' corner', () => {
    const drawn = new Set(level0.cutPolygons.map((p) => p.entityId));
    for (const id of [ARCH.wallA, ARCH.wallB, ARCH.door, pair.strId(STR.column)]) assert.ok(drawn.has(id), `entity ${id} is cut on Level 0`);
    const column = cutBox(level0, pair.strId(STR.column));
    assert.ok(Math.abs(column.minX - cutBox(level0, ARCH.wallB).maxX) < MM);
    assert.ok(Math.abs(column.maxY - cutBox(level0, ARCH.wallA).minY) < MM);
  });

  it('Level 1 cuts its own wall and the structure\'s column, which has no storey there', () => {
    const drawn = new Set(level1.cutPolygons.map((p) => p.entityId));
    assert.ok(drawn.has(ARCH.wallC));
    assert.ok(drawn.has(pair.strId(STR.column)));
    assert.ok(!drawn.has(ARCH.wallA), 'Level 0\'s wall is below the cut');
  });
});
