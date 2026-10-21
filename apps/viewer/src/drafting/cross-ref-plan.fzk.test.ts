/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { planOverlays, type PlanOverlay } from '@/project/plan-overlays';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { annotationFactor } from '@/project/viewport-annotation';
import type { DraftEntity, DraftShape, Pt } from './types';
import { textBox } from './annotation';
import { elevationMarkPlan } from './cross-ref-marks';
import { withCrossReferences } from './cross-ref-plan';
import { draftsOfView } from './draft-store';

/**
 * Audit #221: on the ground plan of AC20-FZK-Haus the elevation marks and the
 * section reference stood on the door swings, which open past the wall. The
 * marks are placed from the real plan: the set the Wall starts for the model,
 * the ground plan's drawing and the door and window symbols it overlays.
 */

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The points a shape occupies, at most `step` metres apart: a door leaf and its swing arc, or any other line. */
function sample(sh: DraftShape, step: number, out: Pt[]): void {
  const along = (a: Pt, b: Pt): void => {
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  if (sh.type === 'line') along(sh.a, sh.b);
  else if (sh.type === 'polyline') {
    for (let i = 0; i + 1 < sh.pts.length; i++) along(sh.pts[i], sh.pts[i + 1]);
    if (sh.closed && sh.pts.length > 2) along(sh.pts[sh.pts.length - 1], sh.pts[0]);
  } else if (sh.type === 'circle' || sh.type === 'arc') {
    const start = sh.type === 'arc' ? sh.start : 0;
    const sweep = sh.type === 'arc' ? (((sh.end - sh.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) : 2 * Math.PI;
    const n = Math.max(2, Math.ceil((sweep * sh.r) / step));
    for (let i = 0; i <= n; i++) out.push({ x: sh.c.x + sh.r * Math.cos(start + (sweep * i) / n), y: sh.c.y + sh.r * Math.sin(start + (sweep * i) / n) });
  }
}

/** Whether `p` lies in the box (corners in order round it) — all boxes here are rectangles. */
function inside(p: Pt, box: Pt[]): boolean {
  const [a, b, , d] = box;
  const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: d.x - a.x, y: d.y - a.y };
  const w = { x: p.x - a.x, y: p.y - a.y };
  const s = (w.x * u.x + w.y * u.y) / (u.x * u.x + u.y * u.y), t = (w.x * v.x + w.y * v.y) / (v.x * v.x + v.y * v.y);
  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

describe('the marks on the ground plan of AC20-FZK-Haus (#221)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let marks: (overlays: readonly PlanOverlay[] | undefined) => DraftEntity[];
  let overlays: PlanOverlay[];
  let factor: number;

  before(async () => {
    const m = await loadPlanModel(FZK_HAUS);
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((x) => x.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    const { views, sheets, drafts } = useProjectStore.getState();
    const ground = elevationMarkPlan(views);
    assert.ok(ground, 'a ground plan');
    const vp = sheets.flatMap((s) => s.viewports ?? []).find((v) => v.viewId === ground.id);
    assert.ok(vp, 'the ground plan is on a sheet');
    const drawing = await m.planOf(ground);
    // The building's walls: the drawing's own bounds also reach the terrace slab and the projected roof, which the plan on a sheet frames loosely round.
    const wall = drawing.cutPolygons.filter((c) => /^IfcWall/.test(m.classOf(c.entityId))).flatMap((c) => c.polygon.outer);
    const bounds = { min: { x: Math.min(...wall.map((q) => q.x)), y: Math.min(...wall.map((q) => q.y)) }, max: { x: Math.max(...wall.map((q) => q.x)), y: Math.max(...wall.map((q) => q.y)) } };
    overlays = planOverlays(ground, drawing.config.plane, meshes, undefined, new Set(), drawing, vp.scale);
    factor = annotationFactor(vp.scale, ground.scale);
    marks = (o) => withCrossReferences({
      drafts: draftsOfView(ground.id, drafts), view: ground, views, sheets, groundPlanId: ground.id, bounds, viewportScale: vp.scale, overlays: o,
    }).filter((d) => d.id.includes('~xref'));
  });

  /** The swings and leaves of the doors, as points. */
  const doorPoints = (): Pt[] => {
    const pts: Pt[] = [];
    for (const o of overlays) if (o.layer === 'SYMBOLS') for (const sh of o.shapes) sample(sh, 0.01, pts);
    return pts;
  };
  /** The paper boxes the marks print in: their text, and each arrow's triangle taken as its box. */
  const boxes = (made: DraftEntity[]): { id: string; box: Pt[] }[] => made.flatMap((d) => {
    const sh = d.shape;
    if (sh.type === 'text') return [{ id: d.id, box: textBox(sh.p, sh.text, sh.height * factor, sh.rotation) }];
    return [];
  });

  it('has door swings to avoid, and marks for two elevations and a section', () => {
    assert.ok(doorPoints().length > 500, 'the plan draws door leaves and swings');
    const texts = marks(overlays).flatMap((d) => (d.shape.type === 'text' ? [d.shape.text] : []));
    assert.ok(texts.length >= 3, texts.join(', '));
  });

  it('puts no mark label on a door leaf or swing', () => {
    const doors = doorPoints();
    for (const { id, box } of boxes(marks(overlays))) {
      const hit = doors.find((p) => inside(p, box));
      assert.equal(hit, undefined, `${id} lies on a door symbol at ${JSON.stringify(hit)}`);
    }
  });

  it('puts no arrow on a door leaf or swing', () => {
    const doors = doorPoints();
    for (const d of marks(overlays)) {
      if (d.shape.type !== 'line') continue;
      const line: Pt[] = [];
      sample(d.shape, 0.01, line);
      for (const p of line) assert.ok(!doors.some((q) => dist(p, q) < 0.01), `${d.id} touches a door symbol`);
    }
  });

  it('puts no mark on another', () => {
    const list = boxes(marks(overlays));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const pts: Pt[] = [];
      const [a, b] = [list[i].box, list[j].box];
      for (const c of b) pts.push(c);
      assert.ok(!pts.some((p) => inside(p, a)) && !a.some((p) => inside(p, b)), `${list[i].id} and ${list[j].id} overlap`);
    }
  });

  it('the old placement, without the symbols as obstacles, did land on a door (the test can fail)', () => {
    const doors = doorPoints();
    const hits = boxes(marks(undefined)).filter(({ box }) => doors.some((p) => inside(p, box)));
    assert.ok(hits.length > 0, 'without the symbols a label lands on a door');
  });
});
