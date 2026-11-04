/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #675: "Mark all levels" (and the LEVELALL step of "Annotate the set") put each mark at its level's true height the first time.
 *
 * A section drawn along a picked line has a custom plane whose origin sits at the height that was picked, so its drawing y is the
 * height above that origin, not above the model's zero. The marks were put at the storey's elevation as a drawing y: off by the
 * origin's height until dragged, when the mark read its height through the plane. The invariant: the number a mark carries is the
 * one it reads after a drag, and it is its level's floor (or the top of what the drawing shows), at any plane origin.
 */

import '@/test/setup-dom.js';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig, Drawing2DGenerator, type Drawing2D } from '@ifc-lite/drawing-2d';
import { annotateSet, targetViews } from '@/annotate-set/annotate-set';
import { ALL_CHOICES } from '@/annotate-set/choices';
import { setExtent } from '@/draft-set/body';
import { draftsOfView } from '@/drafting/draft-store';
import { levelResolverFor } from '@/drafting/level-resolver';
import { levelValueOf, type LevelShape } from '@/drafting/level-mark';
import { viewElements } from '@bimvoice/ifcsheet';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { levelFloorY } from '@/project/view-defaults';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { startSet } from '@/set-template/start';
import { useViewerStore } from '@/store';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';

/** Lloyd's Bonsai house (2026-11-03): not committed, so this part skips when the file is absent. */
const LLOYD = '/Users/petruc/dev/bimvoice/_workspace/models/lloyd/ifc-from-bonsai-2026-11-03.ifc';
/** Where the section was picked: the plane's origin, metres above the model's zero. */
const ORIGIN_Y = [0, 1.37];

for (const [name, path] of [['AC20-FZK-Haus', FZK_HAUS], ["Lloyd's Bonsai house", LLOYD]] as const) describe(`level marks on sections and elevations: ${name}`, { skip: planModelMissing(path) }, () => {
  after(() => useViewDrawings.setState({ byView: {} }));

  for (const originY of ORIGIN_Y) it(`sit at their level's height on first placement, the plane's origin at ${originY} m (#675)`, async () => {
    await loadPlanModel(path);
    const meshes = [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    assert.ok(startSet(meshes, setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent));
    const views = targetViews(ALL_CHOICES).filter((v) => v.kind === 'section');
    assert.ok(views.length > 0, 'the set has sections');
    const bounds = [...models.values()][0].geometryResult!.coordinateInfo.shiftedBounds;
    const drawings = new Map<string, Drawing2D>();
    // A front section along a picked line: the cardinal basis, its origin at the picked height.
    const generator = new Drawing2DGenerator();
    await generator.initialize();
    const mid = (bounds.min.z + bounds.max.z) / 2;
    const config = createSectionConfig('z', mid, { projectionDepth: bounds.max.z - bounds.min.z, scale: 100 });
    config.plane.customPlane = { normal: { x: 0, y: 0, z: 1 }, distance: mid, origin: { x: 0, y: originY, z: mid }, tangent: { x: 1, y: 0, z: 0 }, bitangent: { x: 0, y: 1, z: 0 } };
    const drawing = await generator.generate(meshes, config, { includeHiddenLines: false, includeProjection: true, includeEdges: true, mergeLines: true });
    for (const view of views) {
      drawings.set(view.id, drawing);
      useViewDrawings.setState((s) => ({ byView: { ...s.byView, [view.id]: { ...EMPTY_VIEW_DRAWING, drawing, status: 'ready' } } }));
    }
    await annotateSet({ choices: ALL_CHOICES, mode: 'undoable', viewIds: new Set(views.map((v) => v.id)) });

    const levels = useProjectStore.getState().levels;
    const floors = levels.map(levelFloorY);
    for (const view of views) {
      const drawing = drawings.get(view.id)!;
      const marks = draftsOfView(view.id).flatMap((d) => (d.shape.type === 'level' ? [d.shape as LevelShape] : []));
      assert.ok(marks.length >= 2, `${view.name} has level marks`);
      const resolve = levelResolverFor(view, levels, drawing.config.plane);
      const ys = viewElements(drawing).flatMap((e) => e.ring.map((q) => q.y));
      const [lowest, highest] = [Math.min(...ys) + originY, Math.max(...ys) + originY];
      for (const mark of marks) {
        // What a mark reads after a drag is what it carries from the start.
        assert.ok(mark.ref, 'a mark keeps its reference');
        assert.ok(Math.abs(levelValueOf(mark, resolve) - mark.value) < 1e-6, `${view.name}: the mark carries the number it reads after a drag`);
        assert.ok(Math.abs(mark.p.y - mark.ref.at.y) < 1e-6, `${view.name}: the symbol is on the horizontal through its reference`);
        // The number is a level's floor, or the top of the building.
        const atLevel = floors.some((f) => Math.abs(f - mark.value) < 0.01);
        const atTop = Math.abs(mark.value - highest) < 0.01;
        assert.ok(atLevel || atTop, `${view.name}: ${mark.value} is neither a level (${floors.join(', ')}) nor the top (${highest})`);
      }
      // Every level the drawing shows has its mark.
      for (const f of floors) if (f >= lowest - 0.01 && f <= highest + 0.01) assert.ok(marks.some((m) => Math.abs(m.value - f) < 0.01), `${view.name}: a mark at level ${f}`);
    }
  });
});
