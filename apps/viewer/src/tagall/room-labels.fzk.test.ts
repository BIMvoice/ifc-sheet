/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { planOverlays } from '@/project/plan-overlays';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { elevationMarkPlan } from '@/drafting/cross-ref-marks';
import { textBox } from '@/drafting/annotation';
import { clearDraftHistory } from '@/drafting/draft-store';
import { tagAll } from '@/drafting/commands/tagall';
import type { DraftEntity, DraftShape, Pt } from '@/drafting/types';
import { labelElementByGlobalId } from '@/labels/label-element';
import { viewElements } from '@/labels/view-elements';
import { planSymbolObstacles } from '@/rcp/ceiling-tag-obstacles';
import { roomsOfPlan } from '@/tagall/rooms';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { registerLocale, setLocale } from '@/i18n';
import { TAGALL_TYPES } from '@/tagall/types';
import type { Drawing2D } from '@ifc-lite/drawing-2d';

/**
 * #42: the room labels of the ground plan of AC20-FZK-Haus, from the real plan: the set the Wall starts for the model,
 * the ground plan's drawing, the door and window symbols it overlays. The rooms and their areas are those of the
 * IFC text (`BaseQuantities.NetFloorArea` of #20909 #21283 #21640 #33774 #34191 #34763; the attic's Galerie #76214 is on
 * the other plan): each label must say the room's number, its name and exactly that area, and stand clear of the
 * walls and of the door leaves and swings.
 */

const GROUND = [
  { number: '1', name: 'Flur', area: 11.185458 },
  { number: '2', name: 'Buero', area: 12.59545 },
  { number: '3', name: 'Bad', area: 12.127619 },
  { number: '4', name: 'Schlafzimmer', area: 21.410325 },
  { number: '5', name: 'Wohnen', area: 25.2088935 },
  { number: '6', name: 'Küche', area: 16.30545 },
];

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
function along(a: Pt, b: Pt, step: number, out: Pt[]): void {
  const n = Math.max(1, Math.ceil(dist(a, b) / step));
  for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
}
/** The points a shape occupies, at most `step` metres apart. */
function sample(sh: DraftShape, step: number, out: Pt[]): void {
  if (sh.type === 'line') along(sh.a, sh.b, step, out);
  else if (sh.type === 'polyline') {
    for (let i = 0; i + 1 < sh.pts.length; i++) along(sh.pts[i], sh.pts[i + 1], step, out);
    if (sh.closed && sh.pts.length > 2) along(sh.pts[sh.pts.length - 1], sh.pts[0], step, out);
  } else if (sh.type === 'circle' || sh.type === 'arc') {
    const start = sh.type === 'arc' ? sh.start : 0;
    const sweep = sh.type === 'arc' ? (((sh.end - sh.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) : 2 * Math.PI;
    const n = Math.max(2, Math.ceil((sweep * sh.r) / step));
    for (let i = 0; i <= n; i++) out.push({ x: sh.c.x + sh.r * Math.cos(start + (sweep * i) / n), y: sh.c.y + sh.r * Math.sin(start + (sweep * i) / n) });
  }
}
/** Whether `p` lies in the axis-aligned box of `corners`. */
function inside(p: Pt, corners: Pt[]): boolean {
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
  return p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.y >= Math.min(...ys) && p.y <= Math.max(...ys);
}
/** Whether the box of `corners` meets the outline of `ring` (an edge through it, or the ring wholly inside it). */
function meetsOutline(corners: Pt[], ring: readonly Pt[]): boolean {
  const pts: Pt[] = [];
  for (let i = 0; i < ring.length; i++) along(ring[i], ring[(i + 1) % ring.length], 0.01, pts);
  return pts.some((p) => inside(p, corners));
}

describe('room labels on the ground plan of AC20-FZK-Haus (#42)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let drawing: Drawing2D;
  let classOf: (id: number) => string;
  let doorSymbols: Pt[];
  let ctxFor: (existing?: DraftEntity[]) => Parameters<typeof tagAll>[0];

  before(async () => {
    const m = await loadPlanModel(FZK_HAUS);
    classOf = m.classOf;
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((x) => x.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    const ground = elevationMarkPlan(useProjectStore.getState().views);
    assert.ok(ground, 'a ground plan');
    drawing = await m.planOf(ground);
    const { levels } = useProjectStore.getState();
    const overlays = planOverlays(ground, drawing.config.plane, meshes, undefined, new Set(), drawing, 100);
    doorSymbols = [];
    for (const o of overlays) if (o.layer === 'SYMBOLS') for (const sh of o.shapes) sample(sh, 0.01, doorSymbols);
    publishDrawingRuntime({ geometryResult: { meshes, coordinateInfo: geometryResult?.coordinateInfo } as never, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    ctxFor = (existing = []) => ({
      viewId: ground.id, layerId: '0', settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard' },
      viewKind: () => 'plan', view: () => ground, say: () => {}, entities: () => existing,
      viewElements: () => viewElements(drawing),
      rooms: () => roomsOfPlan(ground, levels, { meshes } as never),
      planObstacles: () => planSymbolObstacles(ground, levels, meshes, undefined),
    }) as unknown as Parameters<typeof tagAll>[0];
  });
  // The Romanian catalogue is not loaded here; the locale only has to exist for the number format to follow it.
  before(() => registerLocale('ro', {}));
  beforeEach(() => { useProjectStore.setState({ drafts: [], annotationTypes: undefined }); clearDraftHistory(); setLocale('en'); });
  after(() => { setLocale('en'); publishDrawingRuntime(null); });

  const roomLabels = (): { text: string; box: Pt[]; draft: DraftEntity }[] => useProjectStore.getState().drafts
    .filter((d) => d.params.atype === 'tagall-room' && d.shape.type === 'text')
    .map((d) => ({ draft: d, text: (d.shape as { text: string }).text, box: textBox((d.shape as { p: Pt }).p, (d.shape as { text: string }).text, (d.shape as { height: number }).height, 0) }));

  it('labels each room of the plan with its number, name and exact area from the model', () => {
    tagAll(ctxFor(), labelElementByGlobalId);
    const texts = roomLabels().map((l) => l.text).sort();
    assert.deepEqual(texts, GROUND.map((r) => `${r.number}\n${r.name}\n${r.area.toFixed(2)} m²`).sort());
  });

  it('writes the areas in the language of the sheet: Romanian takes the decimal comma', () => {
    setLocale('ro');
    tagAll(ctxFor(), labelElementByGlobalId);
    const texts = roomLabels().map((l) => l.text).sort();
    assert.deepEqual(texts, GROUND.map((r) => `${r.number}\n${r.name}\n${r.area.toFixed(2).replace('.', ',')} m²`).sort());
  });

  it('puts no label on a wall', () => {
    tagAll(ctxFor(), labelElementByGlobalId);
    const walls = drawing.cutPolygons.filter((c) => /^IfcWall/.test(classOf(c.entityId))).map((c) => c.polygon.outer);
    assert.ok(walls.length > 8, 'the plan is cut through the walls');
    const labels = roomLabels();
    assert.equal(labels.length, GROUND.length);
    for (const { text, box } of labels) {
      const hit = walls.findIndex((ring) => meetsOutline(box, ring));
      assert.equal(hit, -1, `the label "${text.replace(/\n/g, ' / ')}" meets a wall`);
    }
  });

  it('puts no label on a door leaf or its swing, nor on a window', () => {
    assert.ok(doorSymbols.length > 500, 'the plan draws door leaves and swings');
    tagAll(ctxFor(), labelElementByGlobalId);
    for (const { text, box } of roomLabels()) {
      const hit = doorSymbols.find((p) => inside(p, box));
      assert.equal(hit, undefined, `the label "${text.replace(/\n/g, ' / ')}" lies on a door symbol at ${JSON.stringify(hit)}`);
    }
  });

  it('puts no label on another', () => {
    tagAll(ctxFor(), labelElementByGlobalId);
    const list = roomLabels();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      assert.ok(!list[j].box.some((p) => inside(p, list[i].box)) && !list[i].box.some((p) => inside(p, list[j].box)), `label ${i} and ${j} overlap`);
    }
  });

  it('labels a room once: a second run adds nothing', () => {
    tagAll(ctxFor(), labelElementByGlobalId);
    const first = useProjectStore.getState().drafts.length;
    tagAll(ctxFor(useProjectStore.getState().drafts), labelElementByGlobalId);
    assert.equal(useProjectStore.getState().drafts.length, first);
  });

  it('leaves no unrelated type in the project: TAGALL types are the ones registered', () => {
    tagAll(ctxFor(), labelElementByGlobalId);
    assert.deepEqual((useProjectStore.getState().annotationTypes ?? []).map((t) => t.id).sort(), TAGALL_TYPES.map((t) => t.id).sort());
  });
});
