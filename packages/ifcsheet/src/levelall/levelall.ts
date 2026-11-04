/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LEVELALL as a pure function (#707): the level marks a section or an
 * elevation still needs, planned from plain inputs, with what the run says as
 * translation keys and numbers. The app's command reads the stores, calls this
 * and applies the result (one undo step); the command line and MCP call it with
 * their own inputs. A second run adds only what is missing.
 */

import type { DraftEntity, DraftParamValue, EntityShape, Pt } from '../draft-types.js';
import type { ProjectLevel } from '../document.js';
import { ringBounds } from '../labels/label-geometry.js';
import { makeDraft } from '../make-draft.js';
import { planLevels, type LevelShape } from './plan.js';

type Rect = { x0: number; y0: number; x1: number; y1: number };

export interface LevelAllInputs {
  /** What the view is: only a section or an elevation has level marks (a plan, or no view, gets a message). */
  kind: 'plan' | 'section' | 'elevation' | null;
  /** The model elements the view shows, by outline. */
  elements: readonly { ring: readonly Pt[] }[];
  levels: readonly Pick<ProjectLevel, 'name' | 'elevation' | 'floorY'>[];
  /** The drafts already on the view. */
  existing: readonly DraftEntity[];
  /** The boxes the annotations among the drafts fill (the app's `rectsOf`). */
  rectsOf: (drafts: readonly DraftEntity[]) => Rect[];
  /** The height a drawing point stands for (metres); absent: the drawing's y. */
  heightAt?: (p: Pt) => number;
  placement: { viewId: string; layerId: string; textHeight: number; textStyle: string; dimStyle: string; paperUnit: number };
  /** The style ids a new annotation takes, and where its id comes from. */
  styled(viewId: string, shape: EntityShape, current: { textStyle: string; dimStyle: string }): Record<string, DraftParamValue>;
  newId(): string;
}

/** The keys LEVELALL says things with; the app's catalogue has them (`drafting.msg.levelAll*`). */
export type LevelAllKey =
  | 'drafting.msg.levelAllViewOnly' | 'drafting.msg.levelAllEmpty' | 'drafting.msg.levelAllHave' | 'drafting.msg.levelAllDoneLeft' | 'drafting.msg.levelAllDoneRight';

export interface LevelAllMessage {
  key: LevelAllKey;
  params?: Record<string, number>;
}

export interface LevelAllResult {
  /** The level marks to add. */
  add: DraftEntity[];
  /** What LEVELALL changes of the drafts already there, by draft id: nothing; present so it applies like DIMALL. */
  update: Map<string, EntityShape>;
  messages: LevelAllMessage[];
}

/** What a run of LEVELALL adds and says. */
export function planLevelAll(inputs: LevelAllInputs): LevelAllResult {
  const none = (key: LevelAllKey, params?: Record<string, number>): LevelAllResult => ({ add: [], update: new Map(), messages: [{ key, ...(params ? { params } : {}) }] });
  if (inputs.kind !== 'section' && inputs.kind !== 'elevation') return none('drafting.msg.levelAllViewOnly');
  const rings = inputs.elements.map((e) => ringBounds(e.ring));
  if (rings.length === 0) return none('drafting.msg.levelAllEmpty');
  const bounds = { x0: Math.min(...rings.map((r) => r.x0)), y0: Math.min(...rings.map((r) => r.y0)), x1: Math.max(...rings.map((r) => r.x1)), y1: Math.max(...rings.map((r) => r.y1)) };
  const { placement: at } = inputs;
  const plan = planLevels({
    levels: inputs.levels,
    bounds,
    existing: inputs.existing.flatMap((d) => (d.shape.type === 'level' ? [d.shape as LevelShape] : [])),
    taken: inputs.rectsOf(inputs.existing.filter((d) => d.shape.type !== 'level')),
    heightAt: inputs.heightAt,
    textHeight: at.textHeight,
    paperUnit: at.paperUnit,
  });
  if (plan.marks.length === 0) return none('drafting.msg.levelAllHave', { count: plan.already });
  const add = plan.marks.map((m) => makeDraft(m.shape, { id: inputs.newId(), viewId: at.viewId, layerId: at.layerId, params: { ...inputs.styled(at.viewId, m.shape, { textStyle: at.textStyle, dimStyle: at.dimStyle }), levelAll: m.key } }));
  return { add, update: new Map(), messages: [{ key: plan.side === 'left' ? 'drafting.msg.levelAllDoneLeft' : 'drafting.msg.levelAllDoneRight', params: { count: add.length, already: plan.already } }] };
}
