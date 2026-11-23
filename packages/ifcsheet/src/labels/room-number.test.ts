/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room whose LongName only repeats its Name has no number. The demo model bloc-p4 writes every room that way
 * (`IFCSPACE(...,'Dormitor ap.2',...,'Dormitor ap.2',...)`), and its tags printed "Dormitor ap.2" twice, one line as the
 * number and one as the name.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_CHOICES } from '../annotate/choices.js';
import { annotateSetHeadless } from '../annotate/headless.js';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import type { DraftEntity } from '../draft-types.js';
import { openModel, type OpenedModel } from '../headless.js';
import { ROOM_TYPE_ID } from '../tagall/types.js';
import { roomNumberOf } from './room-number.js';

const BLOC = fileURLToPath(new URL('../../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the room number tests on bloc-p4: ${missing}`);

describe('a room\'s number', () => {
  it('is the Name when a LongName that says something else names the room', () => {
    expect(roomNumberOf('4', 'Schlafzimmer')).toBe('4');
  });
  it('is nothing when there is no LongName, or the LongName repeats the Name', () => {
    expect(roomNumberOf('Kitchen', '')).toBe('');
    expect(roomNumberOf('Kitchen', null)).toBe('');
    expect(roomNumberOf('Dormitor ap.2', 'Dormitor ap.2')).toBe('');
    expect(roomNumberOf('Dormitor ap.2 ', ' Dormitor ap.2')).toBe('');
  });
});

describe.skipIf(missing !== null)('rooms whose LongName repeats their Name, on bloc-p4', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(BLOC)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
  }, 120_000);

  it('are tagged with their name once', async () => {
    const plan = set.document.views.find((v) => v.kind === 'plan')!;
    const { all } = await annotateSetHeadless({ model, set, choices: { ...ALL_CHOICES, dimall: false, levelall: false } as typeof ALL_CHOICES, viewIds: new Set([plan.id]) });
    const tags = all.filter((d: DraftEntity) => d.viewId === plan.id && d.shape.type === 'text' && d.params.atype === ROOM_TYPE_ID);
    expect(tags.length, 'the plan has room tags, so the test can tell').toBeGreaterThan(10);
    for (const tag of tags) {
      const lines = (tag.shape.type === 'text' ? tag.shape.text : '').split('\n').map((l) => l.trim()).filter(Boolean);
      expect(new Set(lines).size, `a tag repeats a line: ${JSON.stringify(lines)}`).toBe(lines.length);
    }
  }, 120_000);
});
