/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The headless TAGALL measures a tag in the frame it draws it in (Refs #557). A room tag of FZK's Dachgeschoss (name and area on
 * three lines) is centred on a point by the label code with the `up` of the label environment; the same frame has to measure its
 * box, or the box the next placement keeps clear of is not where the text is. The app gives a plan up = -1 (`annotationFrameOf`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import type { Pt } from '../draft-types.js';
import { textBoxIn } from '../dimall/measure.js';
import { generateViewDrawings, openModel, type OpenedModel } from '../headless.js';
import { labelDraft } from '../labels/label-draft.js';
import { GLYPH_ASCENT, GLYPH_DESCENT, textBlock } from '../text-block.js';
import { readersOf, annotatableViews } from './headless.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the headless tag frame test: ${missing}`);

describe.skipIf(missing !== null)('annotateSetHeadless measures a room tag in the frame it draws it in, on AC20-FZK-Haus (#557)', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
  }, 120_000);

  it("centres the Dachgeschoss room tag on its point and measures its box with the same up", async () => {
    const { all, views } = annotatableViews(set.document);
    const attic = views.find((v) => v.kind === 'plan' && v.name === 'Dachgeschoss');
    const source = all.find((v) => v.id === attic?.id);
    if (!attic || !source) throw new Error('FZK has no plan called Dachgeschoss');
    const drawings = await generateViewDrawings([source], model.buildingMeshes, set.levels, model.extent!);
    const drawing = drawings.get(attic.id);
    if (!drawing) throw new Error('Dachgeschoss has no drawing');
    const inputs = readersOf(model, set, [], undefined).tagall({ view: attic, drawing, placed: [], newId: () => 'x', locale: 'en' });
    if (!inputs) throw new Error('no TAGALL inputs');
    expect(inputs.env.up, 'the app annotates a plan with up = -1').toBe(-1);
    expect(inputs.reader.measure.frame.up, 'the box is measured with the frame the label is placed in').toBe(inputs.env.up);

    const room = inputs.rooms[0];
    if (!room) throw new Error('Dachgeschoss has no room');
    const centre: Pt = { x: 10, y: 20 };
    const draft = labelDraft(inputs.env, inputs.types.room, room.guid, centre, inputs.placement);
    if (!draft || draft.shape.type !== 'text') throw new Error('no room tag');
    const shape = draft.shape;
    expect(shape.text.split('\n').length, 'name and area on separate lines').toBeGreaterThan(1);

    // Drawn on a plan, the block's y runs down the page with drawing y: glyph rows sit at anchor.y + the block's y.
    const { lines } = textBlock(shape.text, shape.height, shape.frame);
    const glyphTop = shape.p.y - GLYPH_ASCENT * shape.height, glyphBottom = shape.p.y + lines.at(-1)!.y + GLYPH_DESCENT * shape.height;
    expect((glyphTop + glyphBottom) / 2, 'the drawn text is centred on the point').toBeCloseTo(centre.y, 9);

    // The box a later label keeps clear of is the same text: it sits on the point, within the text frame's own padding (a fraction of a line).
    const box = textBoxIn(inputs.reader.measure, shape.p, shape.text, shape.height, shape.rotation, shape.frame).map((p) => p.y);
    expect(Math.abs((Math.min(...box) + Math.max(...box)) / 2 - centre.y)).toBeLessThan(0.5 * shape.height);
  }, 300_000);
});
