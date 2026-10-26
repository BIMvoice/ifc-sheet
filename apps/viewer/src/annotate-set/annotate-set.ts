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

import type { TranslationKey } from '@/i18n';
import { openUndoSpan, runAsStartingState } from '@/drafting/draft-store';
import { useProjectStore } from '@/project/project-store';
import { commandsFor, type AnnotateChoices } from './choices';
import { demandDrawings, waitForDrawing, type DrawingResult } from './drawing-demand';
import { runCommandOnView, type AnnotatableView, type CommandResult } from './run-view';

/** What happened to one view: each command that was asked of it, or why none ran. */
export interface ViewSummary {
  viewId: string;
  name: string;
  kind: AnnotatableView['kind'];
  /** Set when no command ran: the drawing could not be made. */
  skipped?: { key: TranslationKey; params?: Record<string, string | number> };
  results: CommandResult[];
}

export interface SetSummary {
  views: ViewSummary[];
  /** Drafted entities added over the whole set. */
  added: number;
  /** The run was stopped before every view was done. */
  cancelled: boolean;
}

export interface AnnotateProgress {
  done: number;
  total: number;
  viewName: string;
}

export interface AnnotateRun {
  choices: AnnotateChoices;
  mode: 'undoable' | 'starting';
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
export function targetViews(choices: AnnotateChoices): AnnotatableView[] {
  return useProjectStore.getState().views.filter((v): v is AnnotatableView => isAnnotatable(v) && commandsFor(v, choices).length > 0);
}

/** The error a drawing ended with, as the reason a view was skipped. */
function noDrawing(error: string): NonNullable<ViewSummary['skipped']> {
  return { key: 'wall.annotate.reason.noDrawing', params: { error } };
}

export async function annotateSet(run: AnnotateRun): Promise<SetSummary> {
  const targets = targetViews(run.choices);
  const drawingOf = run.drawingOf ?? ((view: AnnotatableView) => waitForDrawing(view.id));
  const span = run.mode === 'undoable' ? openUndoSpan() : null;
  const draft = (change: () => void) => (span ? span.run(change) : runAsStartingState(change));
  const summary: SetSummary = { views: [], added: 0, cancelled: false };
  const releases = new Map<string, () => void>();
  const ask = (view: AnnotatableView) => { if (!releases.has(view.id)) releases.set(view.id, demandDrawings([view.id])); };
  try {
    for (const [i, planned] of targets.entries()) {
      if (run.signal?.aborted) { summary.cancelled = true; break; }
      // The view as it is now: one deleted, or a project opened since, is not annotated.
      const view = useProjectStore.getState().views.find((v) => v.id === planned.id);
      if (!view || !isAnnotatable(view)) continue;
      run.onProgress?.({ done: i, total: targets.length, viewName: view.name });
      for (const next of targets.slice(i, i + 1 + LOOKAHEAD)) ask(next);
      const got = await drawingOf(view);
      const entry: ViewSummary = { viewId: view.id, name: view.name, kind: view.kind, results: [] };
      if (got.drawing) {
        const drawing = got.drawing;
        // One command at a time, the page free between them: DIMALL after TAGALL on a big plan is a second long.
        for (const command of commandsFor(view, run.choices)) {
          try {
            draft(() => { entry.results.push(runCommandOnView(view, drawing, command)); });
          } catch (error) {
            // A command that cannot handle a view does not stop the set: it is said, and the rest go on.
            console.warn(`[annotate-set] ${command} could not run on ${view.name}`, error);
            entry.results.push({ command, outcome: 'skipped', added: 0, ms: 0, messages: [{ key: 'wall.annotate.reason.failed', params: { error: error instanceof Error ? error.message : String(error) } }] });
          }
          await yieldToPage();
        }
        summary.added += entry.results.reduce((n, r) => n + r.added, 0);
      } else {
        entry.skipped = noDrawing(got.error);
      }
      summary.views.push(entry);
      // The view's drawing is let go, unless a tab or a sheet on the screen holds it.
      releases.get(view.id)?.();
      releases.delete(view.id);
    }
    run.onProgress?.({ done: summary.views.length, total: targets.length, viewName: '' });
  } finally {
    for (const release of releases.values()) release();
    span?.close();
  }
  return summary;
}
