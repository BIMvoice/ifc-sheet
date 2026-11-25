/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's "Annotate the set" panel (#333): which commands are switched on, the run in progress, and what the last run
 * did to each view. Kept apart from the panel so closing it does not stop a run or lose its summary.
 */

import { create } from 'zustand';
import { useViewerStore } from '@/store';
import { annotateSet, targetViews, type AnnotateProgress, type SetSummary } from './annotate-set';
import { ALL_TAG_PARTS, type TagParts } from '@bimvoice/ifcsheet';
import { choicesFrom, hasChoices, type AnnotateCommand } from './choices';
import { effectiveOptions, presetsOfProject } from './presets';

interface AnnotatePanelState {
  /** Defaults all on. */
  on: Record<AnnotateCommand, boolean>;
  /** Which labels TAGALL places (#497); defaults all. */
  tagParts: TagParts;
  /** The run in progress; `waiting`: its view's drawing has been waited for a while, and the panel says it is being made (#869). */
  running: (AnnotateProgress & { waiting?: boolean }) | null;
  summary: SetSummary | null;
  /** Why the last click did not annotate, or what stopped the run (#869); cleared by the next run or a change of commands. */
  problem: AnnotateProblem | null;
}

export type AnnotateProblem = { kind: 'nothingOn' } | { kind: 'noModel' } | { kind: 'failed'; message: string };

/**
 * The set has views to annotate but no model is loaded to draw them from (a project file opened before its IFC): no
 * view's drawing can come, and the run would sit on its first view until the drawing wait gives up (`DRAWING_WAIT_MS`), a view at a time.
 */
export const missingModel = (views: number): boolean => views > 0 && useViewerStore.getState().models.size === 0;

export const useAnnotatePanel = create<AnnotatePanelState>()(() => ({
  on: { tagall: true, dimall: true, levelall: true },
  tagParts: { ...ALL_TAG_PARTS },
  running: null,
  summary: null,
  problem: null,
}));

let abort: AbortController | null = null;

export function switchCommand(command: AnnotateCommand, on: boolean): void {
  useAnnotatePanel.setState((s) => ({ on: { ...s.on, [command]: on }, problem: null }));
}

export function switchTagPart(part: keyof TagParts, on: boolean): void {
  useAnnotatePanel.setState((s) => ({ tagParts: { ...s.tagParts, [part]: on } }));
}

/** Switch the panel to a saved preset and run it on the set (one click, #497). Returns false for a preset that is not there. */
export async function applyAnnotationPreset(id: string): Promise<boolean> {
  const preset = presetsOfProject().find((p) => p.id === id);
  if (!preset) return false;
  useAnnotatePanel.setState({ on: { ...preset.on }, tagParts: { ...preset.tagParts } });
  await runAnnotateSet();
  return true;
}

/** Annotate the set with the commands switched on, as one undo step. A run in progress is not started again. */
export async function runAnnotateSet(): Promise<void> {
  const { running, ...panel } = useAnnotatePanel.getState();
  const { on, tagParts } = effectiveOptions(panel);
  const choices = choicesFrom(on);
  if (running) return;
  if (!hasChoices(choices)) {
    useAnnotatePanel.setState({ problem: { kind: 'nothingOn' } });
    return;
  }
  abort = new AbortController();
  useAnnotatePanel.setState({ running: { done: 0, total: 0, viewName: '' }, summary: null, problem: null });
  try {
    if (missingModel(targetViews(choices).length)) {
      useAnnotatePanel.setState({ problem: { kind: 'noModel' } });
      return;
    }
    const summary = await annotateSet({
      choices, tagParts, mode: 'undoable', signal: abort.signal,
      onProgress: (running) => useAnnotatePanel.setState({ running }),
      onDrawingWait: (waiting) => useAnnotatePanel.setState((s) => (s.running ? { running: { ...s.running, waiting } } : s)),
    });
    useAnnotatePanel.setState({ summary });
  } catch (error) {
    // What was drafted before the error stays as one undo step; the user is told, not left with a button that did nothing.
    console.error('Annotate the set failed', error);
    useAnnotatePanel.setState({ problem: { kind: 'failed', message: error instanceof Error ? error.message : String(error) } });
  } finally {
    abort = null;
    useAnnotatePanel.setState({ running: null });
  }
}

/** Stop the run now, a wait for a view's drawing included (#869); what was done stays, as one undo step. */
export function stopAnnotateSet(): void {
  abort?.abort();
}
