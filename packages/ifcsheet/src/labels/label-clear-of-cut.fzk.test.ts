/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door or window mark stands clear of everything the plan cuts, whatever gap its type asks for. Seen on FZK-Haus's
 * ground floor plan with the mark type's gap at 6 mm: two of the nine window marks on the side walls sat on the wall,
 * the wall's lines through "W2". The cause: a label kept clear only of each element's biggest cut outline, and a wall
 * its openings cut in pieces is several, so the piece beside the window was free ground. Measured here through the
 * engine's TAGALL (what `ifcsheet build --annotate` runs) and through Label all's placement (`layoutLabels` over the
 * view's elements, as the app's `defaultCentres` calls it).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { annotateSetHeadless, readersOf } from '../annotate/headless.js';
import type { ALL_CHOICES } from '../annotate/choices.js';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import type { PlanProjectView } from '../document.js';
import type { DraftEntity } from '../draft-types.js';
import { generateViewDrawings, openModel, type OpenedModel } from '../headless.js';
import { MARK_TYPE_ID, TAGALL_TYPES } from '../tagall/types.js';
import type { TagAllInputs } from '../tagall/tagall.js';
import { textBoxOf } from '../text-leader.js';
import { labelDraft, labelSize } from './label-draft.js';
import { rectHitsRing, type Rect } from './label-geometry.js';
import { layoutElementOf, layoutLabels } from './label-layout.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the marks-clear-of-the-cut test: ${missing}`);

const TAGS = { plan: ['tagall'], elevation: [], section: [] } as unknown as typeof ALL_CHOICES;
const GAPS = [1.5, 3, 6, 10] as const;

describe.skipIf(missing !== null)('door and window marks stand clear of the plan\'s cut at every gap (FZK-Haus ground floor)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let plan: PlanProjectView;
  let drawing: Drawing2D;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
    const plans = set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan');
    plan = plans.find((v) => v.name.includes('Erd')) ?? plans[0]!;
    drawing = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!;
  }, 120_000);

  const markType = (gap: number) => {
    const [mark] = TAGALL_TYPES;
    return { ...mark!, label: { ...mark!.label!, gap, leaderEnd: 'dot' as const } };
  };
  const boxOf = (d: DraftEntity): Rect => {
    if (d.shape.type !== 'text') throw new Error('not a text');
    const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, -1);
    return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
  };
  /** The marks whose box lies over any outline the plan cuts (walls, windows, doors, every piece of each). */
  const overCut = (drafts: readonly DraftEntity[]) => drafts.filter((d) => drawing.cutPolygons.some((p) => rectHitsRing(boxOf(d), p.polygon.outer)));
  const openings = () => new Set(drawing.cutPolygons.filter((p) => /^ifc(door|window)$/i.test(model.dataStore.entities.getTypeName(p.entityId))).map((p) => p.entityId)).size;

  it('TAGALL, as `ifcsheet build --annotate` runs it: every door and window marked, none over the cut', async () => {
    for (const gap of GAPS) {
      let n = 0;
      const done = await annotateSetHeadless({
        model, set, choices: TAGS, newId: () => `d${++n}`, viewIds: new Set([plan.id]), tagParts: { doors: true, windows: true, rooms: false },
        tagAllTypes: { mark: markType(gap), room: TAGALL_TYPES[1]! },
      });
      const marks = done.all.filter((d) => d.viewId === plan.id && d.params.atype === MARK_TYPE_ID);
      const over = overCut(marks);
      console.log(`measure: TAGALL gap ${gap} mm: ${over.length} of ${marks.length} marks over the cut`);
      expect(marks.length, `gap ${gap}: one mark per door and window`).toBe(openings());
      expect(over.map((d) => d.params.labelOf), `gap ${gap}`).toEqual([]);
    }
  }, 300_000);

  it('Label all, as the app places it (`layoutLabels` over the view\'s elements): every window labelled, none over the cut', () => {
    for (const gap of GAPS) {
      const type = markType(gap);
      let n = 0;
      const inputs = readersOf(model, set, [], undefined, { mark: type, room: TAGALL_TYPES[1]! }).tagall({ view: plan as never, drawing, placed: [], newId: () => `l${++n}`, locale: 'en' }) as TagAllInputs;
      const at = inputs.placement;
      const windows = inputs.targets.filter((t) => /^ifcwindow$/i.test(t.className));
      const items = windows.flatMap((t) => {
        const size = labelSize(inputs.env, type, t.guid, at.textHeight, at.locale);
        return size ? [{ id: String(t.renderId), ring: t.ring, ...size }] : [];
      });
      const spots = layoutLabels(items, { elements: inputs.elements.map(layoutElementOf), annotations: [], paperUnit: at.paperUnit, gapMm: gap });
      const labels = windows.flatMap((t) => {
        const spot = spots.get(String(t.renderId));
        const d = spot ? labelDraft(inputs.env, type, t.guid, spot.centre, at, t.ring) : null;
        return d ? [d] : [];
      });
      const over = overCut(labels);
      console.log(`measure: Label all gap ${gap} mm: ${over.length} of ${labels.length} window labels over the cut`);
      expect(labels.length, `gap ${gap}: FZK's ground floor has nine windows`).toBe(9);
      expect(over.map((d) => d.params.labelOf), `gap ${gap}`).toEqual([]);
    }
  }, 300_000);
});
