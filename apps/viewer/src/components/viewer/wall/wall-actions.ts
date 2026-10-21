/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Wall's controls change on a view: a plan's cut height and a
 * section's or elevation's view depth, stepped by the wheel; and the few large
 * tools it offers for adding information to a drawing.
 */

import { updateProjectView, useProjectStore } from '@/project/project-store';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import type { ProjectView } from '@/project/types';
import { automaticViewDepth } from '@/lib/section/automatic-depth';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import type { TranslationKey } from '@/i18n';
import type { ToolIconName } from '../ifcsheet/ToolIcon';

/** Cut heights the Wall offers, metres above the floor, and its step. */
export const CUT_HEIGHT_RANGE = { min: 0.3, max: 2.8, step: 0.05 } as const;
/** View depths the Wall offers, metres beyond the cut, and the depth an automatic one starts from. */
export const DEPTH_RANGE = { min: 0.5, max: 60, step: 0.5, start: 5 } as const;

const clampStep = (v: number, r: { min: number; max: number; step: number }): number =>
  Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step));

/** A plan's cut height moved by `steps` (one wheel notch is one step, up is positive). */
export function nudgeCutHeight(viewId: string, steps: number): void {
  const view = useProjectStore.getState().views.find((v) => v.id === viewId);
  if (view?.kind !== 'plan') return;
  const next = Number(clampStep(view.cutHeight + steps * CUT_HEIGHT_RANGE.step, CUT_HEIGHT_RANGE).toFixed(2));
  if (next !== view.cutHeight) updateProjectView(viewId, { cutHeight: next });
}

export function setCutHeight(viewId: string, metres: number): void {
  const view = useProjectStore.getState().views.find((v) => v.id === viewId);
  if (view?.kind !== 'plan') return;
  const next = Number(clampStep(metres, CUT_HEIGHT_RANGE).toFixed(2));
  if (next !== view.cutHeight) updateProjectView(viewId, { cutHeight: next });
}

/**
 * The depth a view with none of its own really looks: the one the drawing and
 * the section's depth band on its plan both start from, so the wheel and the
 * band move one stored depth from the same place.
 */
function automaticDepth(view: Extract<ProjectView, { kind: 'section' | 'elevation' }>): number {
  const viewer = useViewerStore.getState();
  return (view.kind === 'section' ? automaticViewDepth(view.plane, mergedSectionBounds(viewer.models, viewer.geometryResult)) : null) ?? DEPTH_RANGE.start;
}

/** A section's or elevation's view depth moved by `steps`; an automatic depth starts from what it really looks. */
export function nudgeViewDepth(viewId: string, steps: number): void {
  const view = useProjectStore.getState().views.find((v) => v.id === viewId);
  if (view?.kind !== 'section' && view?.kind !== 'elevation') return;
  const current = view.viewDepth ?? automaticDepth(view);
  updateProjectView(viewId, { viewDepth: Number(clampStep(current + steps * DEPTH_RANGE.step, DEPTH_RANGE).toFixed(2)) });
}

export interface WallTool {
  command: string;
  icon: ToolIconName;
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  /** What the card says about ending the tool, where it differs from the draw tools' (`wall.drawHint`). */
  hintKey?: TranslationKey;
}

/** The only tools a sheet offers: dimension, tag, note, level mark, section mark, symbol. */
export const WALL_TOOLS: readonly WallTool[] = [
  { command: 'dimaligned', icon: 'dimension', labelKey: 'wall.tool.dimension', titleKey: 'wall.tool.dimension.title', bodyKey: 'wall.tool.dimension.body', hintKey: 'wall.tool.dimension.hint' },
  { command: 'tag', icon: 'tag', labelKey: 'wall.tool.tag', titleKey: 'wall.tool.tag.title', bodyKey: 'wall.tool.tag.body' },
  { command: 'leader', icon: 'note', labelKey: 'wall.tool.text', titleKey: 'wall.tool.text.title', bodyKey: 'wall.tool.text.body' },
  { command: 'level', icon: 'level', labelKey: 'wall.tool.level', titleKey: 'wall.tool.level.title', bodyKey: 'wall.tool.level.body' },
  { command: 'sectionline', icon: 'section', labelKey: 'wall.tool.section', titleKey: 'wall.tool.section.title', bodyKey: 'wall.tool.section.body' },
  { command: 'symbol', icon: 'symbol', labelKey: 'wall.tool.symbol', titleKey: 'wall.tool.symbol.title', bodyKey: 'wall.tool.symbol.body' },
];

/**
 * Where a plain drawing tool draws: the drawing in front, else the sheet's paper. Parameter text is the exception,
 * since only a sheet resolves `{Name}`: it always goes on the paper.
 */
export function drawTarget(command: string, focusViewId: string | undefined, sheetId: string): string {
  return command === 'ptext' ? sheetId : (focusViewId ?? sheetId);
}

export interface DrawTool {
  command: string;
  labelKey: TranslationKey;
  bodyKey: TranslationKey;
}

/**
 * Plain drawing, on the sheet's paper (or on the drawing in front): lines,
 * polylines, circles, text, a hatched zone and a revision cloud inside a closed polyline.
 */
export const DRAW_TOOLS: readonly DrawTool[] = [
  { command: 'line', labelKey: 'wall.draw.line', bodyKey: 'wall.draw.line.body' },
  { command: 'polyline', labelKey: 'wall.draw.polyline', bodyKey: 'wall.draw.polyline.body' },
  { command: 'circle', labelKey: 'wall.draw.circle', bodyKey: 'wall.draw.circle.body' },
  { command: 'text', labelKey: 'wall.draw.text', bodyKey: 'wall.draw.text.body' },
  { command: 'hatch', labelKey: 'wall.draw.hatch', bodyKey: 'wall.draw.hatch.body' },
  { command: 'revcloud', labelKey: 'wall.draw.revcloud', bodyKey: 'wall.draw.revcloud.body' },
  { command: 'ptext', labelKey: 'wall.draw.ptext', bodyKey: 'wall.draw.ptext.body' },
];

/**
 * A tool's one-action twin, offered under it: the whole plan dimensioned, every
 * door, window and room tagged, every level marked. It runs at once on a
 * drawing of one of `kinds`.
 */
export interface WallAll {
  command: string;
  labelKey: TranslationKey;
  kinds: readonly ProjectView['kind'][];
}

export const WALL_ALL: Readonly<Record<string, WallAll>> = {
  dimaligned: { command: 'dimall', labelKey: 'wall.tool.dimension.all', kinds: ['plan'] },
  tag: { command: 'tagall', labelKey: 'wall.tool.tag.all', kinds: ['plan'] },
  level: { command: 'levelall', labelKey: 'wall.tool.level.all', kinds: ['section', 'elevation'] },
};

/**
 * Start `command` on `viewId` as soon as its drafting view is attached (it
 * mounts in the sheet after this call). Returns the cancel of the wait.
 */
export function startWhenAttached(viewId: string, command: string): () => void {
  if (useDraftingSession.getState().viewId === viewId) {
    startDraftCommand(command);
    return () => {};
  }
  const unsubscribe = useDraftingSession.subscribe((s) => {
    if (s.viewId !== viewId) return;
    unsubscribe();
    startDraftCommand(command);
  });
  // A view that never attaches (nothing to draft on) must not leave the listener behind.
  const timer = setTimeout(unsubscribe, 10_000);
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
