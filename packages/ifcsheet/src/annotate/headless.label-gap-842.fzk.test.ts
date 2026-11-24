/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #842: `ifcsheet build --project p --annotate` runs TAGALL with the project's own door and window mark type, so the gap
 * the app saved on it spaces the marks the engine places, as it does in the app. Measured on FZK-Haus's ground floor plan.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import type { DraftEntity } from '../draft-types.js';
import { openModel, type OpenedModel } from '../headless.js';
import { rectRingGap } from '../labels/label-geometry.js';
import { refToRing } from '../labels/label-leader.js';
import { projectTagAllTypes } from '../labels/label-spec-read.js';
import { textBoxOf } from '../text-leader.js';
import { MARK_TYPE_ID, TAGALL_TYPES } from '../tagall/types.js';
import { ALL_CHOICES } from './choices.js';
import { annotateSetHeadless } from './headless.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the headless label gap test: ${missing}`);

const TAGS = { plan: ['tagall'], elevation: [], section: [] } as unknown as typeof ALL_CHOICES;

describe.skipIf(missing !== null)('the mark type\'s gap reaches the engine\'s TAGALL through the project (#842)', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
  }, 120_000);

  /** The marks TAGALL places on the ground floor plan with the project's `annotationTypes` (absent: no project). */
  const marksWith = async (annotationTypes?: unknown) => {
    const plan = set.document.views.find((v) => v.kind === 'plan' && v.name.includes('Erd')) ?? set.document.views.find((v) => v.kind === 'plan')!;
    let n = 0;
    const done = await annotateSetHeadless({
      model, set, choices: TAGS, newId: () => `d${++n}`, viewIds: new Set([plan.id]), tagParts: { doors: true, windows: true, rooms: false },
      ...(annotationTypes === undefined ? {} : { tagAllTypes: projectTagAllTypes(annotationTypes) }),
    });
    return done.all.filter((d) => d.viewId === plan.id && d.params.atype === MARK_TYPE_ID);
  };
  const boxOf = (d: DraftEntity) => {
    if (d.shape.type !== 'text') throw new Error('not a text');
    const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, -1);
    return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
  };
  type Box = ReturnType<typeof boxOf>;
  const apart = (a: Box, b: Box) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));
  /** Drawing metres per paper millimetre at the plan's scale. */
  const unitOf = () => (set.document.views.find((v) => v.kind === 'plan')?.scale ?? 100) / 1000;
  /** For each mark, the clear space to its door or window and to the nearest other mark, paper millimetres. */
  const spaces = (drafts: readonly DraftEntity[]) => {
    const boxes = drafts.map(boxOf);
    return drafts.map((d, i) => {
      const ring = refToRing(d.params.labelRef);
      if (!ring) throw new Error(`mark ${d.id} has no element outline`);
      const toOther = Math.min(...boxes.filter((_, j) => j !== i).map((b) => apart(boxes[i]!, b)));
      return Math.min(rectRingGap(boxes[i]!, ring), toOther) / unitOf();
    });
  };

  it('a project without a gap places the marks as no project does', async () => {
    const [mark, room] = TAGALL_TYPES;
    expect(await marksWith([mark, room])).toEqual(await marksWith());
  }, 300_000);

  it('a gap of 4 mm on the project\'s mark type gives the marks closer than 4 mm to their element or another mark that space', async () => {
    const [mark] = TAGALL_TYPES;
    const before = await marksWith();
    const after = await marksWith([{ ...mark, label: { ...mark!.label, gap: 4 } }]);
    const was = spaces(before), now = spaces(after);
    const tight = (xs: number[]) => xs.filter((d) => d < 4 - 1e-6).length;
    console.log(`measure: ${before.length} marks; closer than 4 mm: ${tight(was)} by default, ${tight(now)} with gap 4; least ${Math.min(...was).toFixed(2)} -> ${Math.min(...now).toFixed(2)} mm`);
    expect(after.map((d) => d.params.labelOf).sort()).toEqual(before.map((d) => d.params.labelOf).sort());
    expect(tight(was), 'by default some marks sit closer than 4 mm, so the test can tell').toBeGreaterThan(0);
    expect(tight(now)).toBe(0);
  }, 300_000);
});
