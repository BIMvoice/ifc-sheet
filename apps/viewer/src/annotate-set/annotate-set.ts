/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Annotate the set" (#333): TAGALL and DIMALL on every plan, LEVELALL on every
 * elevation and section, with no view open. Each view is annotated by the
 * command itself, given the view's own drawing and what the open view would give
 * it (`run-view.ts`); this module walks the views, keeps the page free between
 * them and reports what happened to each.
 *
 * - As an action (`undoable`) the whole run is ONE undo step, and the drafts
 *   each view gains are the commands' own: a second run adds nothing, because the
 *   commands report what is there already.
 * - As the start of a project made from a set template (`starting`) it leaves no
 *   undo step, as the set it annotates is none.
 */

import { getLocale } from '@/i18n';
import { openUndoSpan, runAsStartingState, editDrafts } from '@/drafting/draft-store';
import { currentSheetLocale } from '@/project/units-and-numbers';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { annotateViews, type AnnotateProgress, type SetSummary, type TagParts, type ViewSummary } from '@bimvoice/ifcsheet';
import { commandsFor, type AnnotateChoices } from './choices';
import { demandDrawings, waitForDrawing, type DrawingResult } from './drawing-demand';
import { appReaders, type AnnotatableView } from './run-view';

export type { AnnotateProgress, SetSummary, ViewSummary };

export interface AnnotateRun {
  choices: AnnotateChoices;
  mode: 'undoable' | 'starting';
  /** Which labels TAGALL places (an annotation preset, #497); absent: every kind. */
  tagParts?: TagParts;
  /** Only these views (a preset applied to one plan); absent: every view of the right kind. */
  viewIds?: ReadonlySet<string>;
  onProgress?: (progress: AnnotateProgress) => void;
  signal?: AbortSignal;
  /** Where the drawing of a view comes from; by default the views' own generators (`drawing-demand.ts`). */
  drawingOf?: (view: AnnotatableView) => Promise<DrawingResult>;
}

/** Drawings asked for ahead of the view being annotated, so the worker makes the next ones while this one is drafted. */
const LOOKAHEAD = 2;

/** Let the page paint and answer input between two views. */
export const yieldToPage = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const isAnnotatable = (view: { kind: string }): view is AnnotatableView => view.kind === 'plan' || view.kind === 'elevation' || view.kind === 'section';

/** The views the choices run on, in the project's order. */
export function targetViews(choices: AnnotateChoices, only?: ReadonlySet<string>): AnnotatableView[] {
  return useProjectStore.getState().views.filter((v): v is AnnotatableView => isAnnotatable(v) && (!only || only.has(v.id)) && commandsFor(v, choices).length > 0);
}

export async function annotateSet(run: AnnotateRun): Promise<SetSummary> {
  const drawingOf = run.drawingOf ?? ((view: AnnotatableView) => waitForDrawing(view.id));
  const span = run.mode === 'undoable' ? openUndoSpan() : null;
  const draft = (change: () => void) => (span ? span.run(change) : runAsStartingState(change));
  const releases = new Map<string, () => void>();
  const ask = (view: AnnotatableView) => { if (!releases.has(view.id)) releases.set(view.id, demandDrawings([view.id])); };
  try {
    const { summary } = await annotateViews<AnnotatableView, Drawing2D>({
      views: targetViews(run.choices, run.viewIds),
      choices: run.choices,
      presets: { tagParts: run.tagParts },
      readers: appReaders,
      drawingOf,
      newId: () => freshProjectId('draft'),
      locale: currentSheetLocale(getLocale()),
      signal: run.signal,
      // The view as it is now: one deleted, or a project opened since, is not annotated.
      refresh: (planned) => {
        const now = useProjectStore.getState().views.find((v) => v.id === planned.id);
        return now && isAnnotatable(now) ? now : null;
      },
      onProgress: run.onProgress,
      beforeView: (_view, i, targets) => { for (const next of targets.slice(i, i + 1 + LOOKAHEAD)) ask(next); },
      afterCommand: (_view, _command, change) => {
        if (change.add.length > 0) draft(() => { editDrafts({ add: [...change.add], update: new Map(change.update) }); });
      },
      pause: yieldToPage,
      // The view's drawing is let go, unless a tab or a sheet on the screen holds it.
      afterView: (view) => { releases.get(view.id)?.(); releases.delete(view.id); },
    });
    return summary;
  } finally {
    for (const release of releases.values()) release();
    span?.close();
  }
}
