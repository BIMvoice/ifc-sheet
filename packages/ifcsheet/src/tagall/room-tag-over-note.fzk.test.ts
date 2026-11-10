/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * End to end on AC20-FZK-Haus (#557, PR #779 follow-up): FZK's Dachgeschoss room tag "7 / Galerie / 74.51 m2" does not fit its room. With a
 * NOTE put on the room where the tag goes, the annotated set keeps the tag off the note (a default run has nothing there to avoid).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from '../default-set.js';
import { openModel } from '../headless.js';
import { ALL_CHOICES } from '../annotate/choices.js';
import { annotateSetHeadless, DEFAULT_DRAFT_LAYER } from '../annotate/headless.js';
import { tableMeasure, textBoxIn } from '../dimall/measure.js';
import type { DraftEntity } from '../draft-types.js';
import { sheetFormat } from '../units-and-numbers.js';
import { ROOM_TYPE_ID } from './types.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the room tag over note test: ${missing}`);

// A plan's frame, as the headless annotation measures it (up = -1).
const measure = { ...tableMeasure, frame: { up: -1 as const, right: 1 as const } };
function boxOf(d: DraftEntity) {
  if (d.shape.type !== 'text') throw new Error('not a text');
  const pts = textBoxIn(measure, d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame);
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
}

describe.skipIf(missing !== null)('a room tag over a NOTE on AC20-FZK-Haus (#557)', () => {
  it('keeps the Galerie tag off a NOTE put where the tag goes', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set) throw new Error('no set: the model has no extent');
    const locale = sheetFormat('en', undefined);
    const isGalerie = (d: DraftEntity) => d.params.atype === ROOM_TYPE_ID && d.shape.type === 'text' && d.shape.text.includes('Galerie');

    const first = (await annotateSetHeadless({ model, set, choices: ALL_CHOICES, locale })).all.find(isGalerie);
    if (!first || first.shape.type !== 'text') throw new Error('no Galerie tag in a default run');
    const note: DraftEntity = { id: 'note', viewId: first.viewId, layerId: DEFAULT_DRAFT_LAYER.id, shape: { type: 'text', p: first.shape.p, text: 'NOTE: Galerie', height: first.shape.height, rotation: 0 }, params: {} };

    const again = (await annotateSetHeadless({ model, set, choices: ALL_CHOICES, locale, existing: [note] })).all.find(isGalerie);
    if (!again) throw new Error('no Galerie tag with the note');
    const a = boxOf(again), b = boxOf(note);
    const overlap = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    expect(overlap, 'the tag box and the note box share no area').toBe(0);
    // A clear gap of at least half the text height (1.25 mm of a 2.5 mm line on paper), so the note and the tag do not read as one block.
    const gap = Math.max(a.y0 - b.y1, b.y0 - a.y1, a.x0 - b.x1, b.x0 - a.x1);
    expect(gap, 'the tag keeps half a text height clear of the note').toBeGreaterThanOrEqual(0.5 * first.shape.height - 1e-9);
  }, 600_000);
});
