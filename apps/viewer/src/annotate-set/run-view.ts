/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One drafting command (TAGALL, DIMALL, LEVELALL) run on a view that need not
 * be open (#333). The planning is the engine's (`annotateViews`, #707); what it
 * reads from the view comes from `viewInputs`, the function the open view
 * installs into the session with, and the context around it from `makeContext`,
 * the builder the session uses. So the command sees what it would see if the
 * view were in front: the view's drawing, its obstacles, its rooms, its elements.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { getLocale, type TranslationKey } from '@/i18n';
import type { DraftContext } from '@/drafting/commands/types';
import { withAnnotationFrame } from '@/drafting/annotation';
import { dimAllInputs } from '@/drafting/commands/dimall';
import { levelAllInputs } from '@/drafting/commands/level-all';
import { tagAllInputs } from '@/drafting/commands/tagall';
import { labelElementByGlobalId } from '@/labels/label-element';
import { runAnnotateCommand, type AnnotateReaders, type CommandResult, type Outcome, type Said, type TagParts } from '@bimvoice/ifcsheet';
import { draftsOfView, editDrafts } from '@/drafting/draft-store';
import { AXIS_NAME } from '@/drafting/frame';
import { baseDraftSettings, currentLayerId, visibleEntities } from '@/drafting/session';
import { scaledDraftSettings } from '@/drafting/session-settings';
import { annotationFrameOf, makeContext } from '@/drafting/view-context';
import { viewInputs } from '@/drafting/view-inputs';
import { currentSheetLocale } from '@/project/units-and-numbers';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { freshProjectId } from '@/project/view-defaults';
import type { AnnotateCommand } from './choices';

export type { CommandResult, Outcome, Said };

/** A view the one-action commands run on: a plan, an elevation or a section. */
export type AnnotatableView = Extract<ProjectView, { kind: 'plan' | 'elevation' | 'section' }>;

/** What a command says through the context, as the command line would echo it. */
interface ContextSaid {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

/** The context a command runs with on `view`, which need not be open: what the command says goes to `say`, the selection it makes stays in the context. */
export function contextForView(view: AnnotatableView, drawing: Drawing2D, say: (said: ContextSaid) => void): DraftContext {
  const plane = drawing.config.plane;
  let selection: ReadonlySet<string> = new Set();
  const inputs = viewInputs({ view, drawing, entities: draftsOfView(view.id), plane, levels: useProjectStore.getState().levels });
  // The snap shapes and the model picker belong to a pointer on the open view; the one-action commands read neither.
  return makeContext(view.id, { ...inputs, referenceShapes: () => [], elementAt: () => null }, {
    layerId: currentLayerId(),
    axis: AXIS_NAME[plane.axis],
    // Annotation sizes are paper sizes at the view's scale, as the view in front reads them.
    settings: scaledDraftSettings({ ...baseDraftSettings() }, () => (view.scale ?? 100) / 100),
    entities: () => visibleEntities(view.id),
    selection: () => selection,
    setSelection: (ids) => { selection = ids; },
    say: (key, params) => say({ key, params }),
  });
}

/** What the commands read from a view, as the open view would give it: the registry's own inputs, through `contextForView`. */
export const appReaders: AnnotateReaders<AnnotatableView, Drawing2D> = {
  draftsOf: (view) => draftsOfView(view.id, useProjectStore.getState().drafts),
  dimall: (call) => dimAllInputs(contextForView(call.view, call.drawing, () => {}), call.newId, call.placed),
  tagall: (call) => tagAllInputs(contextForView(call.view, call.drawing, () => {}), labelElementByGlobalId),
  levelall: (call) => levelAllInputs(contextForView(call.view, call.drawing, () => {}), call.newId),
  inFrame: (_view, drawing, plan) => {
    const frame = annotationFrameOf(AXIS_NAME[drawing.config.plane.axis]);
    return withAnnotationFrame(frame.up, frame.right, plan);
  },
};

/** Run `command` on `view`, whose drawing is `drawing` (the one the view stores: `drawingShownBy`), and draft what it plans. */
export function runCommandOnView(view: AnnotatableView, drawing: Drawing2D, command: AnnotateCommand, tagParts?: TagParts): CommandResult {
  const { change, result } = runAnnotateCommand({
    readers: appReaders, view, drawing, command, placed: draftsOfView(view.id), newId: () => freshProjectId('draft'), locale: currentSheetLocale(getLocale()), tagParts,
  });
  if (change.add.length > 0) editDrafts({ add: [...change.add], update: new Map(change.update) });
  return result;
}
