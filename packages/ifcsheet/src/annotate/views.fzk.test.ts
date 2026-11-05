/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Annotate the set" through the engine alone on AC20-FZK-Haus (#707): the drawings `generateViewDrawings` makes go to
 * `annotateViews`, which plans TAGALL and DIMALL on the plans and LEVELALL on the elevations and sections with no session,
 * no store and no browser. Each command's drafts land on the views it is made for, and a second run, given the first run's
 * drafts, adds none.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import { tableMeasure } from '../dimall/measure.js';
import { planParts } from '../dimall/parts.js';
import type { DraftEntity } from '../draft-types.js';
import type { PlanProjectView, ProjectView } from '../document.js';
import { generateViewDrawings, openModel, type OpenedModel } from '../headless.js';
import type { LabelElement } from '../labels/label-resolve.js';
import { viewElements } from '../labels/view-elements.js';
import { styleBookOf } from '../style-fit.js';
import { roomsOfPlan } from '../tagall/rooms.js';
import { TAGALL_TYPES } from '../tagall/types.js';
import { ALL_CHOICES } from './choices.js';
import { annotateViews, type AnnotateReaders, type AnnotateView, type ReadCall } from './views.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus annotate-the-set test: ${missing}`);

type View = AnnotateView & { scale?: number | undefined };

describe.skipIf(missing !== null)('annotateViews on the views of AC20-FZK-Haus (#707)', () => {
  let views: View[];
  let drawings: Map<string, Drawing2D>;
  let readers: AnnotateReaders<View, Drawing2D>;
  const kept = new Map<string, readonly DraftEntity[]>();

  beforeAll(async () => {
    const model: OpenedModel = await openModel(new Uint8Array(readFileSync(FZK)));
    const set: DefaultSet | null = generateDefaultSet(model, { now: 0 });
    if (!set) throw new Error('no set: the model has no extent');
    const all = set.document.views.filter((v): v is Extract<ProjectView, { kind: 'plan' | 'elevation' | 'section' }> => v.kind === 'plan' || v.kind === 'elevation' || v.kind === 'section');
    drawings = await generateViewDrawings(all, model.buildingMeshes, set.levels, model.extent!);
    views = all.filter((v) => drawings.has(v.id)).map((v) => ({ id: v.id, name: v.name, kind: v.kind, scale: v.scale }));
    const ds = model.dataStore;
    const guidOf = (renderId: number) => ds.entities.getGlobalId(renderId) || null;
    const classOf = (renderId: number) => ds.entities.getTypeName(renderId);
    const byGuid = new Map<string, number>();
    const element = (guid: string): LabelElement | null => {
      const id = byGuid.get(guid);
      if (id === undefined) return null;
      const cls = classOf(id);
      return {
        attribute: (name) => (name === 'Name' ? ds.entities.getName(id) : ''), className: () => cls, typeName: () => '', propertySets: () => [], quantitySets: () => [],
        typePropertySets: () => [], typeQuantitySets: () => [], materials: () => [], storey: () => '', lengthUnitScale: () => 1,
      };
    };
    const placement = (c: ReadCall<View, Drawing2D>) => ({ viewId: c.view.id, layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: (c.view.scale ?? 100) / 1000 });
    const plans = new Map(set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan').map((v) => [v.id, v]));
    readers = {
      draftsOf: (view) => kept.get(view.id) ?? [],
      dimall: (c) => ({
        ...placement(c), placed: c.placed, parts: planParts(c.drawing, model.buildingMeshes), rooms: [], obstacles: [], newId: c.newId, book: styleBookOf(undefined, undefined),
        firstMm: undefined, settings: { textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard' }, reader: { sectionLink: () => null, measure: tableMeasure }, rectsOf: () => [],
      }),
      tagall: (c) => {
        const elements = c.view.kind === 'plan' ? viewElements(c.drawing) : [];
        const targets = elements.flatMap((e) => {
          const guid = guidOf(e.renderId);
          if (!guid) return [];
          byGuid.set(guid, e.renderId);
          return [{ guid, className: classOf(e.renderId), anchor: e.anchor, renderId: e.renderId, ring: e.ring }];
        });
        const plan = plans.get(c.view.id);
        const rooms = plan ? roomsOfPlan(plan, set.levels, { meshes: model.meshes }, guidOf) : [];
        for (const r of rooms) byGuid.set(r.guid, r.renderId);
        const [mark, room] = TAGALL_TYPES;
        return {
          onPlan: c.view.kind === 'plan', elements, targets, rooms, existing: c.placed, placement: { ...placement(c), locale: c.locale }, types: { mark, room },
          env: { read: element, up: 1, styled: () => ({}), newId: c.newId }, reader: { sectionLink: () => null, measure: tableMeasure }, rectsOf: () => [],
        };
      },
      levelall: (c) => ({
        kind: c.view.kind, elements: viewElements(c.drawing), levels: set.levels, existing: c.placed, rectsOf: () => [], placement: placement(c), styled: () => ({}), newId: c.newId,
      }),
    };
  }, 300_000);

  const run = () => {
    let n = 0;
    return annotateViews({ views, choices: ALL_CHOICES, readers, drawingOf: async (v) => ({ drawing: drawings.get(v.id)! }), newId: () => `d${++n}`, locale: 'en' });
  };
  const shapesOf = (viewId: string, drafts: Map<string, { add: DraftEntity[] }>) => (drafts.get(viewId)?.add ?? []).map((d) => d.shape.type);

  it('puts tags and dimensions on plans and level marks on elevations and sections, each on its own kind of view', async () => {
    const { drafts, summary } = await run();
    expect(summary.cancelled).toBe(false);
    expect(summary.views).toHaveLength(views.length);
    const of = (kind: View['kind']) => views.filter((v) => v.kind === kind);
    const planShapes = of('plan').flatMap((v) => shapesOf(v.id, drafts));
    const cutShapes = [...of('elevation'), ...of('section')].flatMap((v) => shapesOf(v.id, drafts));
    expect(planShapes).toContain('dimension');
    expect(planShapes.length).toBeGreaterThan(planShapes.filter((s) => s === 'dimension').length);
    expect(planShapes).not.toContain('level');
    expect(cutShapes).toContain('level');
    expect(cutShapes).not.toContain('dimension');
    expect(summary.added).toBe([...drafts.values()].reduce((n, d) => n + d.add.length, 0));
  });

  it("a second run, given the first run's drafts, adds none", async () => {
    const first = await run();
    for (const [id, d] of first.drafts) kept.set(id, d.add);
    try {
      const again = await run();
      expect(again.summary.added).toBe(0);
      expect([...again.drafts.values()].every((d) => d.add.length === 0)).toBe(true);
      expect(again.summary.views.flatMap((v) => v.results).every((r) => r.outcome !== 'added')).toBe(true);
    } finally {
      kept.clear();
    }
  });
});
