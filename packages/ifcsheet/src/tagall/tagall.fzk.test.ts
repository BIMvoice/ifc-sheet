/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TAGALL planned through the engine alone on AC20-FZK-Haus (#707): the plan the engine draws gives the elements and the rooms,
 * `planTagAll` gives the labels with no session, no store and no browser; a second run with the first run's labels in place adds none.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanProjectView } from '../document.js';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import { tableMeasure } from '../dimall/measure.js';
import { generateViewDrawings, openModel, type OpenedModel } from '../headless.js';
import type { LabelElement } from '../labels/label-resolve.js';
import { viewElements } from '../labels/view-elements.js';
import { makeDraft } from '../make-draft.js';
import { roomsOfPlan } from './rooms.js';
import { planTagAll, type TagAllInputs } from './tagall.js';
import { TAGALL_TYPES } from './types.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus TAGALL test: ${missing}`);

describe.skipIf(missing !== null)('planTagAll on the plans of AC20-FZK-Haus (#707)', () => {
  let inputs: TagAllInputs;

  beforeAll(async () => {
    const model: OpenedModel = await openModel(new Uint8Array(readFileSync(FZK)));
    const set: DefaultSet | null = generateDefaultSet(model, { now: 0 });
    if (!set) throw new Error('no set: the model has no extent');
    const plans = set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    const ds = model.dataStore;
    const guidOf = (renderId: number) => ds.entities.getGlobalId(renderId) || null;
    const byGuid = new Map<string, number>();
    const element = (guid: string): LabelElement | null => {
      const id = byGuid.get(guid);
      if (id === undefined) return null;
      const cls = ds.entities.getTypeName(id);
      return {
        attribute: (name) => (name === 'Name' ? ds.entities.getName(id) : ''), className: () => cls, typeName: () => '', propertySets: () => [], quantitySets: () => [],
        typePropertySets: () => [], typeQuantitySets: () => [], materials: () => [], storey: () => '', lengthUnitScale: () => 1,
      };
    };
    // The plan with the most doors and windows in it.
    const classOf = (renderId: number) => ds.entities.getTypeName(renderId);
    const scored = plans.map((view) => {
      const elements = viewElements(drawings.get(view.id)!);
      return { view, elements, openings: elements.filter((e) => /^ifc(door|window)$/i.test(classOf(e.renderId))).length };
    }).sort((a, b) => b.openings - a.openings)[0];
    const targets = scored.elements.flatMap((e) => {
      const guid = guidOf(e.renderId);
      if (!guid) return [];
      byGuid.set(guid, e.renderId);
      return [{ guid, className: classOf(e.renderId), anchor: e.anchor, renderId: e.renderId, ring: e.ring }];
    });
    const rooms = roomsOfPlan(scored.view, set.levels, { meshes: model.meshes }, guidOf);
    for (const r of rooms) byGuid.set(r.guid, r.renderId);
    let n = 0;
    const [mark, room] = TAGALL_TYPES;
    inputs = {
      onPlan: true, elements: scored.elements, targets, rooms, existing: [],
      placement: { viewId: scored.view.id, layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: (scored.view.scale ?? 100) / 1000, locale: 'en' },
      types: { mark, room },
      env: { read: element, up: 1, styled: () => ({}), newId: () => `t${++n}` },
      reader: { sectionLink: () => null, measure: tableMeasure }, rectsOf: () => [],
    };
  }, 300_000);

  it('labels the doors, windows and rooms, one label each, with its message as a translation key', () => {
    const first = planTagAll(inputs);
    expect(first.add.length).toBeGreaterThan(0);
    expect(first.summary.marks).toBeGreaterThan(0);
    expect(first.summary.rooms).toBeGreaterThan(0);
    expect(first.add.length).toBe(first.summary.marks + first.summary.rooms);
    expect(new Set(first.add.map((d) => String(d.params.labelOf))).size).toBe(first.add.length);
    expect(first.messages[0]).toEqual({ key: 'drafting.msg.tagAllDone', params: { marks: first.summary.marks, rooms: first.summary.rooms, already: 0 } });
  });

  it('a second run with the first run in place adds nothing and says so', () => {
    const first = planTagAll(inputs);
    const placed = first.add.map((d) => makeDraft(d.shape, { id: d.id, viewId: d.viewId, layerId: d.layerId, params: d.params }));
    const again = planTagAll({ ...inputs, existing: placed });
    expect(again.add).toEqual([]);
    expect(again.messages[0].key).toBe('drafting.msg.tagAllHave');
    expect(again.summary.already).toBe(first.add.length);
  });

  it('on a section it tags rooms only', () => {
    const cut = planTagAll({ ...inputs, onPlan: false });
    expect(cut.summary.marks).toBe(0);
  });
});
