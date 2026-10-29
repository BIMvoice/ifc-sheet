/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's "Annotate the set" panel (#333): which commands are switched on, the run in progress, and what the last run
 * did to each view. Kept apart from the panel so closing it does not stop a run or lose its summary.
 */

import { create } from 'zustand';
import { annotateSet, type AnnotateProgress, type SetSummary } from './annotate-set';
import { ALL_TAG_PARTS, type TagParts } from '@/tagall/types';
import { choicesFrom, hasChoices, type AnnotateCommand } from './choices';
import { effectiveOptions, presetsOfProject } from './presets';

interface AnnotatePanelState {
  /** Defaults all on. */
  on: Record<AnnotateCommand, boolean>;
  /** Which labels TAGALL places (#497); defaults all. */
  tagParts: TagParts;
  running: AnnotateProgress | null;
  summary: SetSummary | null;
}

export const useAnnotatePanel = create<AnnotatePanelState>()(() => ({
  on: { tagall: true, dimall: true, levelall: true },
  tagParts: { ...ALL_TAG_PARTS },
  running: null,
  summary: null,
}));

let abort: AbortController | null = null;

export function switchCommand(command: AnnotateCommand, on: boolean): void {
  useAnnotatePanel.setState((s) => ({ on: { ...s.on, [command]: on } }));
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
  if (running || !hasChoices(choices)) return;
  abort = new AbortController();
  useAnnotatePanel.setState({ running: { done: 0, total: 0, viewName: '' }, summary: null });
  try {
    const summary = await annotateSet({ choices, tagParts, mode: 'undoable', signal: abort.signal, onProgress: (running) => useAnnotatePanel.setState({ running }) });
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
