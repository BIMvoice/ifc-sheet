/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Headless TAGALL reads a view as the app's does (#557), on AC20-FZK-Haus: a detail plan is tagged inside its crop only (the app
 * passes the view's own `detail` to `planTagAll`), and a section tags the rooms its plane cuts (the app's `viewInputs` reads them
 * with `roomsOfCut`), where the headless step had given it none.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanProjectView, ProjectView } from '../document.js';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import type { DraftEntity } from '../draft-types.js';
import { generateViewDrawings, openModel, type OpenedModel } from '../headless.js';
import { roomsOfCut } from '../tagall/cut-rooms.js';
import { ROOM_TYPE_ID } from '../tagall/types.js';
import { ALL_CHOICES } from './choices.js';
import { annotateSetHeadless } from './headless.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the headless TAGALL crop and rooms test: ${missing}`);

const TAGS = { ...ALL_CHOICES, dimall: false, levelall: false } as typeof ALL_CHOICES;

describe.skipIf(missing !== null)('headless TAGALL matches the app on AC20-FZK-Haus (#557)', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
  }, 120_000);

  const tagsOf = (drafts: readonly DraftEntity[], viewId: string) => drafts.filter((d) => d.viewId === viewId && d.shape.type === 'text' && typeof d.params.labelOf === 'string');
  const run = (views: ProjectView[], id: string) => annotateSetHeadless({ model, set: { ...set, document: { ...set.document, views } }, choices: TAGS, viewIds: new Set([id]) });

  it('tags a detail plan inside its crop only, and a whole plan outside it too', async () => {
    const plan = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name.includes('Erd')) ?? set.document.views.find((v): v is PlanProjectView => v.kind === 'plan')!;
    const drawing = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!;
    const { min, max } = drawing.bounds;
    const crop = { min, max: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 } };
    const inside = (d: DraftEntity) => d.shape.type === 'text' && d.shape.p.x >= crop.min.x && d.shape.p.x <= crop.max.x && d.shape.p.y >= crop.min.y && d.shape.p.y <= crop.max.y;
    const whole = tagsOf((await run(set.document.views, plan.id)).all, plan.id);
    const detail: PlanProjectView = { ...plan, id: 'detail-557', name: 'Detail', detail: { of: plan.id, ...crop, number: 1 } };
    const cropped = tagsOf((await run([...set.document.views, detail], detail.id)).all, detail.id);
    console.log(`measure: whole ${whole.length} tags, ${whole.filter((d) => !inside(d)).length} outside the crop; detail ${cropped.length} tags, ${cropped.filter((d) => !inside(d)).length} outside`);
    expect(whole.filter((d) => !inside(d)).length, 'the plan has tags outside the crop, so the test can tell').toBeGreaterThan(0);
    expect(cropped.length).toBeGreaterThan(0);
    expect(cropped.filter((d) => !inside(d))).toEqual([]);
  }, 120_000);

  it('tags the rooms a section cuts, as the app reads them', async () => {
    const sections = set.document.views.filter((v) => v.kind === 'section');
    expect(sections.length).toBeGreaterThan(0);
    const drawings = await generateViewDrawings(sections, model.buildingMeshes, set.levels, model.extent!);
    const guidOf = (id: number) => model.dataStore.entities.getGlobalId(id) || null;
    let withRooms = 0;
    for (const s of sections) {
      const drawing = drawings.get(s.id)!;
      const cut = new Set(roomsOfCut(drawing.config.plane, drawing, model.meshes, guidOf).map((r) => r.guid));
      const tagged = tagsOf((await run(set.document.views, s.id)).all, s.id).filter((d) => d.params.atype === ROOM_TYPE_ID).map((d) => String(d.params.labelOf));
      console.log(`measure: ${s.name} cuts ${cut.size} rooms, headless tags ${tagged.length}`);
      expect(tagged.every((g) => cut.has(g))).toBe(true);
      expect(new Set(tagged).size).toBe(tagged.length);
      if (cut.size > 0) { withRooms++; expect(tagged.length, `${s.name}`).toBeGreaterThan(0); }
    }
    expect(withRooms, 'FZK has a section that cuts rooms').toBeGreaterThan(0);
  }, 240_000);
});
