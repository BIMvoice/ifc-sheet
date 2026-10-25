/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's "Annotate the set" panel (#333): which commands are switched on, the run in progress, and what the last run
 * did to each view. Kept apart from the panel so closing it does not stop a run or lose its summary.
 */

import { create } from 'zustand';
import { annotateSet, type AnnotateProgress, type SetSummary } from './annotate-set';
import { choicesFrom, hasChoices, type AnnotateCommand } from './choices';

interface AnnotatePanelState {
  /** Defaults all on. */
  on: Record<AnnotateCommand, boolean>;
  running: AnnotateProgress | null;
  summary: SetSummary | null;
}

export const useAnnotatePanel = create<AnnotatePanelState>()(() => ({
  on: { tagall: true, dimall: true, levelall: true },
  running: null,
  summary: null,
}));

let abort: AbortController | null = null;

export function switchCommand(command: AnnotateCommand, on: boolean): void {
  useAnnotatePanel.setState((s) => ({ on: { ...s.on, [command]: on } }));
}

/** Annotate the set with the commands switched on, as one undo step. A run in progress is not started again. */
export async function runAnnotateSet(): Promise<void> {
  const { on, running } = useAnnotatePanel.getState();
  const choices = choicesFrom(on);
  if (running || !hasChoices(choices)) return;
  abort = new AbortController();
  useAnnotatePanel.setState({ running: { done: 0, total: 0, viewName: '' }, summary: null });
  try {
    const summary = await annotateSet({ choices, mode: 'undoable', signal: abort.signal, onProgress: (running) => useAnnotatePanel.setState({ running }) });
    useAnnotatePanel.setState({ summary });
  } finally {
    abort = null;
    useAnnotatePanel.setState({ running: null });
  }
}

/** Stop after the view being annotated; what was done stays, as one undo step. */
export function stopAnnotateSet(): void {
  abort?.abort();
}
