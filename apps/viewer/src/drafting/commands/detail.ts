/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DETAIL: the person marks a rectangle on a plan, section or elevation and
 * gets a detail view of that area, with its mark on the source view. Making a
 * detail and changing its crop are one undo step each.
 */

import { addProjectView, updateProjectView, useProjectStore } from '@/project/project-store';
import { detailOf, detailRect } from '@/project/detail';
import { SHEET_SCALES } from '@/project/sheets';
import { styledParams } from '@/project/drafting-standards';
import type { ViewDetail } from '@/project/types';
import { runAsOneUndoStep, editDrafts, newDraft } from '../draft-store';
import { DETAIL_LINK, detailLabel, detailMarkLabel, detailMarkShapes, markParts, PART } from '../detail-mark';
import type { DraftLayer, DraftShape, EntityShape, Pt } from '../types';
import type { DraftCommandDef } from './types';

type Rect = Pick<ViewDetail, 'min' | 'max'>;

/** The layer detail marks are drawn on: dashed, made when the project has none. */
export const DETAIL_LAYER_ID = 'detail-marks';

function ensureDetailLayer(): string {
  const { draftLayers } = useProjectStore.getState();
  if (draftLayers.some((l) => l.id === DETAIL_LAYER_ID)) return DETAIL_LAYER_ID;
  const layer: DraftLayer = { id: DETAIL_LAYER_ID, name: 'Detail marks', color: '#1f2937', visible: true, locked: false, lineWeight: 0.35, lineType: 'dashed' };
  useProjectStore.setState({ draftLayers: [...draftLayers, layer], dirty: true });
  return DETAIL_LAYER_ID;
}

/** Metres of drawing that stand for one paper metre at the view's scale. */
const paperMetres = (scale: number | undefined): number => (scale ?? 100) / 1000;

/**
 * A detail of `a`..`b` on view `sourceId`: the view, and its mark on the
 * source. Returns the detail's id, or `null` when the area is too small or the
 * source cannot have a detail (a 3D view).
 */
export function addDetail(sourceId: string, a: Pt, b: Pt, current: { textStyle: string; dimStyle: string }): string | null {
  const state = useProjectStore.getState();
  const source = state.views.find((v) => v.id === sourceId);
  const rect = detailRect(a, b);
  if (!source || source.kind === '3d' || !rect) return null;
  let id: string | null = null;
  runAsOneUndoStep(() => {
    id = addProjectView(detailOf(source, rect, state.views, SHEET_SCALES));
    const created = useProjectStore.getState().views.find((v) => v.id === id);
    if (!created?.detail) return;
    const layerId = ensureDetailLayer();
    const shapes = detailMarkShapes(rect, detailLabel(created.detail.number), paperMetres(source.scale), source.kind === 'plan');
    editDrafts({
      add: shapes.map((shape, i) => newDraft(sourceId, layerId, shape, { ...styledParams(sourceId, shape, current), [DETAIL_LINK]: id as string, [PART]: i })),
    });
  });
  return id;
}

/** Change the area a detail shows: its crop and its mark move together. */
export function setDetailRect(detailViewId: string, rect: Rect): void {
  const { views, drafts, sheets } = useProjectStore.getState();
  const view = views.find((v) => v.id === detailViewId);
  const source = view?.detail ? views.find((v) => v.id === view.detail?.of) : undefined;
  if (!view?.detail || !source) return;
  const shapes = detailMarkShapes(rect, detailMarkLabel(detailViewId, view.detail.number, views, sheets), paperMetres(source.scale), source.kind === 'plan');
  const parts = markParts(drafts, detailViewId);
  runAsOneUndoStep(() => {
    updateProjectView(detailViewId, { detail: { ...view.detail as ViewDetail, ...rect } });
    editDrafts({ update: new Map<string, EntityShape>(parts.map((p) => [p.id, shapes[Number(p.params[PART] ?? 0)] ?? p.shape])) });
  });
}

export const detailCommand: DraftCommandDef = {
  id: 'detail',
  aliases: ['DETAIL', 'DET'],
  labelKey: 'drafting.cmd.detail',
  create(ctx) {
    let first: Pt | null = null;
    const frame = (p: Pt): DraftShape => ({ type: 'polyline', pts: [first as Pt, { x: p.x, y: (first as Pt).y }, p, { x: (first as Pt).x, y: p.y }], closed: true });
    return {
      prompt: () => ({ key: first ? 'drafting.prompt.detailOpposite' : 'drafting.prompt.detailFirst' }),
      input: () => 'point',
      basePoint: () => first,
      onPoint(p) {
        if (ctx.viewKind() === null) {
          ctx.say('drafting.msg.detailOnView');
          return 'done';
        }
        if (!first) {
          first = p;
          return 'continue';
        }
        const id = addDetail(ctx.viewId, first, p, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle });
        ctx.say(id ? 'drafting.msg.detailCreated' : 'drafting.msg.detailTooSmall');
        return 'done';
      },
      preview: (cursor) => (first ? [frame(cursor)] : []),
    };
  },
};
