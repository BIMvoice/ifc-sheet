/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room tag keeps its text off everything the plan cuts, every piece of it (the room tags' half of #897). Measured on
 * FZK-Haus's ground floor: the living room's tag "5 / Wohnen" lay on a flight of the stair. The floor slab seen below the
 * cut left the tag no place counted clear in its room, so it took the room's deepest point, and nothing then looked at
 * the cut. Through the engine's TAGALL as `ifcsheet build --annotate` runs it (the app's TAGALL calls the same `planTagAll`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { annotateSetHeadless } from '../annotate/headless.js';
import type { ALL_CHOICES } from '../annotate/choices.js';
import { generateDefaultSet } from '../default-set.js';
import type { PlanProjectView } from '../document.js';
import type { DraftEntity } from '../draft-types.js';
import { generateViewDrawings, openModel } from '../headless.js';
import { rectHitsRing, type Rect } from '../labels/label-geometry.js';
import { storeyFloorsOf } from '../plan-projection.js';
import { textBoxOf } from '../text-leader.js';
import { terrainMeshesOf } from '../view-drawings.js';
import { ROOM_TYPE_ID } from './types.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the room tags clear of the cut test: ${missing}`);

const TAGS = { plan: ['tagall'], elevation: [], section: [] } as unknown as typeof ALL_CHOICES;

const boxOf = (d: DraftEntity): Rect => {
  if (d.shape.type !== 'text') throw new Error('not a text');
  const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, -1);
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
};

describe.skipIf(missing !== null)('room tags stand off the plan\'s cut (FZK-Haus)', () => {
  it('TAGALL, as `ifcsheet build --annotate` runs it: every room tagged on every plan, no tag over a cut piece', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set) throw new Error('no set: the model has no extent');
    const plans = set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan');
    // The drawings the run itself draws (`annotateSetHeadless`), to measure against.
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!, undefined, undefined, storeyFloorsOf(model.buildingMeshes, model.dataStore?.spatialHierarchy), terrainMeshesOf(model.meshes, model.dataStore));
    let n = 0;
    const done = await annotateSetHeadless({ model, set, choices: TAGS, newId: () => `d${++n}`, tagParts: { doors: true, windows: true, rooms: true } });
    const over: string[] = [];
    let tags = 0;
    for (const plan of plans) {
      const cut = drawings.get(plan.id)!.cutPolygons;
      for (const d of done.all.filter((x) => x.viewId === plan.id && x.params.atype === ROOM_TYPE_ID)) {
        tags++;
        const box = boxOf(d);
        if (cut.some((p) => rectHitsRing(box, p.polygon.outer))) over.push(`${plan.name}: ${d.shape.type === 'text' ? d.shape.text.replace(/\n/g, ' / ') : d.id}`);
      }
    }
    // FZK's ground floor has six rooms and its attic one: none is left untagged by keeping off the cut.
    expect(tags).toBe(7);
    expect(over).toEqual([]);
  }, 300_000);
});
