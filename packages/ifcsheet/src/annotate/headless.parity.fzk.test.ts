/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotating the set headlessly matches the app on AC20-FZK-Haus (#707): a door or window is tagged with the mark the joinery schedule
 * gives it (the app's `openingMarkOf`, the engine's `markIndex` over the schedule's entries), and no label overlaps another label or a
 * dimension figure, because `rectsOf` measures the annotations placed before it. It also keeps tags and dimension figures off the door swings
 * and window frames of the plan, the obstacles the app's reader passes (`planSymbolObstacles`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { annotationRects } from '../dimall/annotation-rects.js';
import { textBoxIn, tableMeasure } from '../dimall/measure.js';
import { dimensionLayout } from '../dimension-figure.js';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import type { DraftEntity } from '../draft-types.js';
import { markIndex } from '../element-mark.js';
import { generateViewDrawings, openModel, sectionConfigFor, type OpenedModel } from '../headless.js';
import { openingObstacles } from '../dimall/plan-obstacles.js';
import { planOpeningSymbols } from '../plan-openings.js';
import type { DraftShape } from '../draft-types.js';
import { DEFAULT_JOINERY_MAPPING } from '../joinery-mapping.js';
import { joineryScheduleData } from '../joinery-schedule.js';
import { scheduleModelsOf } from '../schedule-models.js';
import { MARK_TYPE_ID } from '../tagall/types.js';
import { ALL_CHOICES } from './choices.js';
import { annotateSetHeadless, readersOf, type HeadlessAnnotateResult } from './headless.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the headless annotate parity test: ${missing}`);

describe.skipIf(missing !== null)('annotateSetHeadless matches the app on AC20-FZK-Haus (#707)', () => {
  let model: OpenedModel;
  let result: HeadlessAnnotateResult;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made: DefaultSet | null = generateDefaultSet(model, { now: 0 });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
    result = await annotateSetHeadless({ model, set, choices: ALL_CHOICES });
  }, 120_000);

  const texts = (drafts: readonly DraftEntity[]) => drafts.flatMap((d) => (d.shape.type === 'text' ? [d.shape.text] : []));

  it('tags the doors and windows with the marks of the schedule, not the plain IFC Tag', () => {
    const schedule = joineryScheduleData(scheduleModelsOf(model), { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING }, 'all');
    const marks = new Set(markIndex(schedule.entries).values());
    const printed = new Set(texts(result.all));
    expect(marks.size, 'the house has numbered openings').toBeGreaterThan(0);
    const missingMarks = [...marks].filter((m) => !printed.has(m));
    expect(missingMarks, `tags printed: ${[...printed].join(' ')}`).toEqual([]);
  });

  it('keeps every label clear of the labels and dimension figures placed with it', () => {
    const rectsOf = annotationRects(tableMeasure);
    // A dimension's figure is the box of its printed value; the span of its lines is not a place a label may not be.
    const boxOf = (d: DraftEntity) => {
      if (d.shape.type !== 'dimension') return rectsOf([d])[0]!;
      const layout = dimensionLayout(d.shape, {}, tableMeasure.frame, tableMeasure.widthOf);
      const pts = textBoxIn(tableMeasure, layout.textAt, layout.label, d.shape.height, layout.textAngle);
      return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
    };
    const name = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.text : 'dimension');
    const overlaps: string[] = [];
    for (const view of new Set(result.all.map((d) => d.viewId))) {
      const boxes = result.all.filter((d) => d.viewId === view && (d.shape.type === 'text' || d.shape.type === 'dimension')).map((d) => ({ d, r: boxOf(d) }));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        if (a.d.shape.type === 'dimension' && b.d.shape.type === 'dimension') continue;
        const w = Math.min(a.r.x1, b.r.x1) - Math.max(a.r.x0, b.r.x0), h = Math.min(a.r.y1, b.r.y1) - Math.max(a.r.y0, b.r.y0);
        if (w > 1e-6 && h > 1e-6) overlaps.push(`${view}: ${name(a.d)} / ${name(b.d)}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('places a label clear of a text that is already on the view', async () => {
    // A door or window tag, the kind this test was written on. Taking the first tag of any kind took a room tag once the first
    // plan's two W1 tags moved to leaders (#557: in the Dachgeschoss plan the ground floor's west wall #21966 now shows 13.5 m
    // of edges that lie on the visible edges of the gable wall above it, all but 0.07 m, so the labels read it as an element of
    // the plan). That room tag, "7 Galerie", is one the run reports too big for its room (tagAllTooSmall 1, on main too): it goes
    // to the room's deepest point whatever is there (`roomLabelPoint`), and lands on a NOTE put on it on main as on the branch.
    const tag = result.all.find((d) => d.shape.type === 'text' && d.shape.text !== '' && !d.shape.leader && d.params.atype === MARK_TYPE_ID);
    if (!tag) throw new Error('the first run placed no door or window tag without a leader');
    // A text of the draughtsman's where the first run put a tag: the run must put its tag elsewhere.
    const obstacle: DraftEntity = { id: 'obstacle', viewId: tag.viewId, layerId: tag.layerId, shape: { ...tag.shape, text: 'NOTE' } as DraftEntity['shape'], params: {} };
    const again = await annotateSetHeadless({ model, set, choices: ALL_CHOICES, existing: [obstacle], viewIds: new Set([tag.viewId]) });
    const rectsOf = annotationRects(tableMeasure);
    const [taken] = rectsOf([obstacle]);
    const hits = again.all.filter((d) => d.id !== 'obstacle' && d.viewId === tag.viewId && d.shape.type === 'text').filter((d) => {
      const r = rectsOf([d])[0]!;
      return Math.min(r.x1, taken!.x1) - Math.max(r.x0, taken!.x0) > 1e-6 && Math.min(r.y1, taken!.y1) - Math.max(r.y0, taken!.y0) > 1e-6;
    });
    expect(again.all.some((d) => d.id !== 'obstacle' && d.shape.type === 'text'), 'the run still tags the view').toBe(true);
    expect(hits.map((d) => d.shape.type === 'text' ? d.shape.text : '')).toEqual([]);
  });

  /** The tags and dimension figures of `drafts` that touch a solid stroke of a door or window symbol of the plans of `plans`; the plans must have swings and labels. */
  function touchingSymbols(plans: DefaultSet, drafts: readonly DraftEntity[]): { swings: number; checked: number; touching: string[] } {
    const rectsOf = annotationRects(tableMeasure);
    const figure = (d: DraftEntity) => {
      if (d.shape.type !== 'dimension') return rectsOf([d])[0]!;
      const layout = dimensionLayout(d.shape, {}, tableMeasure.frame, tableMeasure.widthOf);
      const pts = textBoxIn(tableMeasure, layout.textAt, layout.label, d.shape.height, layout.textAngle);
      return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
    };
    const sources = { live: { dataStore: model.dataStore!, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } };
    let swings = 0, checked = 0;
    const touching: string[] = [];
    for (const view of plans.document.views) {
      if (view.kind !== 'plan') continue;
      const plane = sectionConfigFor(view, plans.levels, model.extent!)!.plane;
      const symbols = planOpeningSymbols(model.buildingMeshes, plane, sources, undefined, view.level);
      const arcs = (list: DraftShape[] | undefined) => (list ?? []).filter((sh) => sh.type === 'arc').length;
      swings += symbols.reduce((n, s) => n + arcs(s.shapes) + arcs(s.heavy) + arcs(s.dashed), 0);
      const solid = openingObstacles(symbols).filter((b) => !b.dashed);
      for (const d of drafts.filter((e) => e.viewId === view.id && (e.shape.type === 'dimension' || (e.shape.type === 'text' && !e.shape.leader)))) {
        const r = figure(d);
        checked++;
        if (solid.some((b) => Math.min(r.x1, b.x1) - Math.max(r.x0, b.x0) > 1e-6 && Math.min(r.y1, b.y1) - Math.max(r.y0, b.y0) > 1e-6)) touching.push(`${view.name}: ${d.shape.type === 'text' ? d.shape.text : 'dimension'}`);
      }
    }
    return { swings, checked, touching };
  }

  it('keeps every tag and dimension figure off the door swings and window frames of the plan (#707)', () => {
    const { swings, checked, touching } = touchingSymbols(set, result.all);
    expect(swings, 'the plans have door swings').toBeGreaterThan(0);
    expect(checked, 'the plans have tags and dimension figures').toBeGreaterThan(0);
    expect(touching).toEqual([]);
  });

  it('hands DIMALL and TAGALL the door swings and window frames of each plan as obstacles, the boxes the app\'s planSymbolObstacles reads (#707)', async () => {
    // On FZK the labels clear the swings with or without them (the layout already keeps tags off a door's swing ring), so the wiring is read at the readers: what each command is given.
    const readers = readersOf(model, set, [], undefined);
    const plans = set.document.views.filter((v) => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    const sources = { live: { dataStore: model.dataStore!, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } };
    let counted = 0;
    for (const view of plans) {
      const drawing = drawings.get(view.id);
      if (!drawing) continue;
      const call = { view: { id: view.id, name: view.name, kind: view.kind, scale: view.scale }, drawing, placed: [], newId: () => 'x', locale: 'en' as const };
      const expected = openingObstacles(planOpeningSymbols(model.buildingMeshes, drawing.config.plane, sources, undefined, view.level));
      counted += expected.length;
      expect(readers.dimall(call)?.obstacles, `${view.name}: DIMALL obstacles`).toEqual(expected);
      expect(readers.tagall(call)?.obstacles, `${view.name}: TAGALL obstacles`).toEqual(expected);
    }
    expect(counted, 'the plans have symbol boxes').toBeGreaterThan(0);
  }, 120_000);
});
