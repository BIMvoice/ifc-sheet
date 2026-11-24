/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #850: a layered wall cut in one piece takes the hatch of its thickest layer's material, the same on the app's sheet and the engine's
 * headless sheets. Before, an element of several materials cut in one piece was named by no material, so at the default 1:100 (coarse
 * detail, where a wall is drawn by its outline) every layered wall stayed plain grey whatever hatch its materials had.
 *
 * The committed Bonsai house (`packages/ifcsheet/src/__fixtures__/bonsai-house-2-storey.ifc`): its ten walls are WALL-300, brick 0.14,
 * insulation 0.12 and plaster 0.04. Its layers are put in the order plaster, brick, insulation here, so the thickest layer is not the
 * first. It is loaded into the app's stores (`viewMaterials` and `cutMaterialName` name a cut face's material through the loaded model and
 * its edit overlay) and opened by the engine (`materialResolver(headlessMaterialSource)`, what the headless sheets draw with). Both read
 * the generated set's plans, at 1:100 (coarse) and layer by layer (fine), with the same materials table.
 */

import '@/test/setup-dom.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { atDetailLevel, generateDefaultSet, resolveDetailLevel, type DefaultSet, type DetailLevel } from '@bimvoice/ifcsheet';
import { headlessMaterialSource, materialMakeupOf } from '@bimvoice/ifcsheet/material-colour';
import { materialDrawing, materialResolver, type MaterialDrawing } from '@bimvoice/ifcsheet/material-drawing';
import type { ProjectMaterial } from '@bimvoice/ifcsheet/materials';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { resetProject, useProjectStore } from './project-store';
import { cutMaterialName, viewMaterials } from './material-resolver';

const BONSAI = fileURLToPath(new URL('../../../../packages/ifcsheet/src/__fixtures__/bonsai-house-2-storey.ifc', import.meta.url));

const row = (name: string, hatch: string): ProjectMaterial => ({ id: name, name, hatch, hatchScale: 1, hatchPen: 'hairline' });
const TABLE = [row('Plaster', 'ANSI31'), row('Brick', 'BRICKCUT')];

describe('a layered wall cut in one piece is hatched by its thickest layer, alike in the app and the engine (#850)', { skip: planModelMissing(BONSAI) }, () => {
  let dir: string;
  let engine: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;
  /** The walls of three layers. */
  let layered: Set<number>;

  before(async () => {
    const text = readFileSync(BONSAI, 'utf8');
    const reordered = text.replace('IFCMATERIALLAYERSET((#74,#78,#80)', 'IFCMATERIALLAYERSET((#80,#74,#78)');
    assert.notEqual(reordered, text, 'the fixture holds the layer set this test reorders');
    dir = mkdtempSync(join(tmpdir(), 'dominant-material-'));
    const file = join(dir, 'bonsai-reordered.ifc');
    writeFileSync(file, reordered);
    await loadPlanModel(file);
    engine = await openModel(new Uint8Array(readFileSync(file)));
    set = generateDefaultSet(engine, { now: 0 })!;
    assert.ok(set && engine.extent, 'the engine lays out a set');
    drawings = await generateViewDrawings(set.document.views.filter((v) => v.kind === 'plan'), engine.buildingMeshes, set.levels, engine.extent!);
    layered = new Set([...drawings.values()].flatMap((d) => d.cutPolygons.map((p) => p.entityId))
      .filter((id) => { const m = materialMakeupOf(engine.dataStore!, id); return m?.kind === 'layers' && m.layers.length === 3; }));
    assert.ok(layered.size >= 4, `the plans cut the layered walls (${layered.size})`);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => resetProject());

  /** A plan at `level`, as each side makes it: its cut faces with their layer, hatch and join name, and the material drawing in numbers. */
  const sides = (drawing: Drawing2D, level: DetailLevel, table: ProjectMaterial[]) => {
    useProjectStore.setState({ materials: table });
    const at = atDetailLevel(drawing, level);
    const resolver = materialResolver(headlessMaterialSource(engine.dataStore!), table);
    const faces = (m: MaterialDrawing | null, joinName: (p: Drawing2D['cutPolygons'][number]) => string | null) => at.cutPolygons
      .filter((p) => layered.has(p.entityId))
      .map((p) => `${p.materialId ?? '-'}|${m?.hatches.find((h) => h.loops[0] === p.polygon.outer)?.pattern ?? 'none'}|${joinName(p) ?? '-'}`);
    return {
      app: faces(viewMaterials(at), cutMaterialName),
      eng: faces(materialDrawing(at, resolver), (p) => resolver.nameOf!(p)),
    };
  };
  const plans = () => set.document.views.filter((v) => v.kind === 'plan' && drawings.get(v.id)?.cutPolygons.some((p) => layered.has(p.entityId)));

  it('at 1:100 every layered wall is one outline hatched as brick, its thickest layer, in the app and the engine', () => {
    assert.equal(resolveDetailLevel(undefined, 100), 'coarse');
    assert.ok(plans().length >= 1, 'a plan cuts the layered walls');
    for (const view of plans()) {
      const { app, eng } = sides(drawings.get(view.id)!, 'coarse', TABLE);
      assert.deepEqual(app, eng, `${view.name}: the layered walls' cut, app vs engine`);
      assert.deepEqual([...new Set(app)], ['-|BRICKCUT|Brick'], `${view.name}: one outline per wall, of no layer, hatched and joined as brick`);
    }
  });

  it('at 1:100 with no row for brick, or no rows at all, the walls stay plain as before', () => {
    for (const view of plans()) {
      for (const table of [[row('Plaster', 'ANSI31')], []]) {
        const { app, eng } = sides(drawings.get(view.id)!, 'coarse', table);
        assert.deepEqual(app, eng, `${view.name}, ${table.length} rows: app vs engine`);
        const joinName = table.length ? 'Brick' : '-';
        assert.deepEqual([...new Set(app)], [`-|none|${joinName}`], `${view.name}, ${table.length} rows: no hatch`);
      }
    }
  });

  it('cut layer by layer (fine), each band keeps its own layer\'s hatch, in the app and the engine', () => {
    for (const view of plans()) {
      const { app, eng } = sides(drawings.get(view.id)!, 'fine', TABLE);
      assert.deepEqual(app, eng, `${view.name}: the layered walls' bands, app vs engine`);
      // Brick #71, insulation #77 (no row: what its name suggests), plaster #79.
      assert.deepEqual([...new Set(app.map((f) => f.split('|').slice(0, 2).join('|')))].filter((f) => f.startsWith('71|') || f.startsWith('79|')).sort(), ['71|BRICKCUT', '79|ANSI31'], `${view.name}: brick and plaster bands`);
      assert.ok(app.every((f) => !f.startsWith('-|')), `${view.name}: every face is a layer band`);
    }
  });
});
