/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotating the set headlessly matches the app on AC20-FZK-Haus (#707): a door or window is tagged with the mark the joinery schedule
 * gives it (the app's `openingMarkOf`, the engine's `markIndex` over the schedule's entries), and no label overlaps another label or a
 * dimension figure, because `rectsOf` measures the annotations placed before it.
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
import { openModel, type OpenedModel } from '../headless.js';
import { DEFAULT_JOINERY_MAPPING } from '../joinery-mapping.js';
import { joineryScheduleData } from '../joinery-schedule.js';
import { scheduleModelsOf } from '../schedule-models.js';
import { ALL_CHOICES } from './choices.js';
import { annotateSetHeadless, type HeadlessAnnotateResult } from './headless.js';

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
    const tag = result.all.find((d) => d.shape.type === 'text' && d.shape.text !== '' && !d.shape.leader);
    if (!tag) throw new Error('the first run placed no tag');
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
});
