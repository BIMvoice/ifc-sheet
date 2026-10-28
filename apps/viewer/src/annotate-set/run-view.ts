/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One drafting command (TAGALL, DIMALL, LEVELALL) run on a view that need not
 * be open (#333). The command is the registry's own, unchanged; what it reads
 * from the view comes from `viewInputs`, the function the open view installs
 * into the session with, and the context around it from `makeContext`, the
 * builder the session uses. So the command sees what it would see if the view
 * were in front: the view's drawing, its obstacles, its rooms, its elements.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { TranslationKey } from '@/i18n';
import type { DraftContext } from '@/drafting/commands/types';
import { withAnnotationFrame } from '@/drafting/annotation';
import { draftCommandById } from '@/drafting/commands/registry';
import { draftsOfView } from '@/drafting/draft-store';
import { AXIS_NAME } from '@/drafting/frame';
import { baseDraftSettings, currentLayerId, visibleEntities } from '@/drafting/session';
import { scaledDraftSettings } from '@/drafting/session-settings';
import { annotationFrameOf, makeContext } from '@/drafting/view-context';
import { viewInputs } from '@/drafting/view-inputs';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import type { AnnotateCommand } from './choices';

/** A view the one-action commands run on: a plan, an elevation or a section. */
export type AnnotatableView = Extract<ProjectView, { kind: 'plan' | 'elevation' | 'section' }>;

/** What a command said while it ran: a message key with its parameters, as the command line would echo it. */
export interface Said {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

/**
 * How a command ended on a view: it added something; it found everything there already; or it did nothing, and
 * `messages[0]` says why (a command's own words: "works on a plan", "nothing to dimension", "not on a detail").
 */
export type Outcome = 'added' | 'already' | 'skipped';

export interface CommandResult {
  command: AnnotateCommand;
  outcome: Outcome;
  /** Drafted entities the command added to the view. */
  added: number;
  messages: Said[];
  /** How long the command held the page, milliseconds. */
  ms: number;
}

/** What the commands say when they find the view complete, with the count of what is there (absent: it counts none). */
const HAVE: Partial<Record<TranslationKey, 'already' | 'count' | null>> = {
  'drafting.msg.tagAllHave': 'already',
  'drafting.msg.dimAllHave': null,
  'drafting.msg.levelAllHave': 'count',
};

function outcomeOf(added: number, messages: readonly Said[]): Outcome {
  if (added > 0) return 'added';
  const have = messages.find((m) => m.key in HAVE);
  if (!have) return 'skipped';
  const counted = HAVE[have.key];
  // "Every door, window and room has its label already (0)" is a plan with nothing to label, not a plan that is done.
  return counted === null || counted === undefined ? 'already' : Number(have.params?.[counted] ?? 0) > 0 ? 'already' : 'skipped';
}

/** The context a command runs with on `view`, which need not be open: what the command says goes to `say`, the selection it makes stays in the context. */
export function contextForView(view: AnnotatableView, drawing: Drawing2D, say: (said: Said) => void): DraftContext {
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

/** Run `command` on `view`, whose drawing is `drawing` (the one the view stores: `drawingShownBy`). */
export function runCommandOnView(view: AnnotatableView, drawing: Drawing2D, command: AnnotateCommand): CommandResult {
  const def = draftCommandById(command);
  if (!def?.run) throw new Error(`[annotate-set] ${command} is not a one-action drafting command`);
  const messages: Said[] = [];
  const context = contextForView(view, drawing, (said) => messages.push(said));
  const before = draftsOfView(view.id).length;
  const started = performance.now();
  const frame = annotationFrameOf(AXIS_NAME[drawing.config.plane.axis]);
  withAnnotationFrame(frame.up, frame.right, () => def.run?.(context, ''));
  const ms = performance.now() - started;
  const added = draftsOfView(view.id).length - before;
  const outcome = outcomeOf(added, messages);
  // A plan with nothing to label is not "complete already": say that there is nothing, not the command's "has its label (0)".
  const said: Said[] = outcome === 'skipped' && messages.some((m) => m.key in HAVE) ? [{ key: 'wall.annotate.reason.nothing' }] : messages;
  return { command, outcome, added, messages: said, ms };
}
