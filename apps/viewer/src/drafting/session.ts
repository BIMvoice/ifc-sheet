/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting session: which view is being drafted on, the running
 * command, the selection, ortho / snap toggles and the command-line
 * history. One session for the app — drafting happens in the tab in front.
 *
 * Input flows in already snapped (the view layer resolves snaps, since it
 * owns the pixel tolerance); the session applies ortho, typed coordinates
 * and command-line keywords, and drives the command state machine.
 */

import { create } from 'zustand';
import type { TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { draftCommandById } from './commands/registry';
import { namedCommand } from './command-name';
import type { DraftCommand, DraftCommandDef, DraftContext, DraftSettings, Prompt, StepResult } from './commands/types';
import { entityBounds, nearestOnEntity, setAnnotationScreenRight, setAnnotationScreenUp } from './annotation';
import { applyTypedLine } from './command-line';
import { applyOrtho } from './input';
import type { SectionAxisName } from './frame';
import { defaultDraftSettings, scaledDraftSettings } from './session-settings';
import { draftsOfView } from './draft-store';
import { withSectionParts } from './section-symbol';
import { elementBoxesAt, hasModelPicker, installedViewInputs, modelElementAt, pickModel, referenceShapesIn, setReferenceProvider } from './session-providers';
import { annotationFrameOf, makeContext } from './view-context';
import type { DraftEntity, DraftShape, Pt } from './types';

// What the view in front installs (providers, pickers) lives in `session-providers.ts`; callers keep importing it from here.
export {
  activeWorkPlane, clearViewInputs, installViewInputs, levelRefAt, resolveLevelRef, setAnnotationProviders, setElementBoxProvider, setElementPicker, setLevelReferenceProviders, setModelPicker, setPlanObstaclesProvider, setPlanPartsProvider, setRoomsProvider, setViewElementsProvider, setWorkPlaneProvider,
} from './session-providers';

export interface HistoryLine {
  key: TranslationKey;
  params?: Record<string, string | number>;
  /** What the user typed, echoed verbatim. */
  typed?: string;
}

interface SessionState {
  viewId: string | null;
  axis: SectionAxisName;
  commandId: string | null;
  /** Gathering the selection a modify command needs before it starts. */
  selecting: boolean;
  prompt: Prompt | null;
  history: HistoryLine[];
  selection: ReadonlySet<string>;
  ortho: boolean;
  /** Ctrl is down: ortho applies for as long as it is, over the toggle. */
  orthoHeld: boolean;
  snap: boolean;
  lastCommandId: string | null;
  /** Bumped whenever the running command's internal state changes (preview refresh). */
  revision: number;
}

export const useDraftingSession = create<SessionState>()(() => ({
  viewId: null,
  axis: 'down',
  commandId: null,
  selecting: false,
  prompt: null,
  history: [],
  selection: new Set(),
  ortho: false,
  orthoHeld: false,
  snap: true,
  lastCommandId: null,
  revision: 0,
}));

const HISTORY_LINES = 50;
const settings: DraftSettings = defaultDraftSettings();
let command: DraftCommand | null = null;
let pending: DraftCommandDef | null = null;
export const draftSettings = (): Readonly<DraftSettings> => scaledSettings;
/** The settings as set, before the view's units scale them (what `patchDraftSettings` writes). */
export const baseDraftSettings = (): Readonly<DraftSettings> => settings;

/** The styles new annotations take; the text height setting follows the current text style (paper mm → metres at 1:100). */
export function setCurrentStyles(patch: { textStyle?: string; dimStyle?: string; textHeightMm?: number }): void {
  if (patch.textStyle) settings.currentTextStyle = patch.textStyle;
  if (patch.dimStyle) settings.currentDimStyle = patch.dimStyle;
  if (patch.textHeightMm) settings.textHeight = patch.textHeightMm / 10;
  settings.annotationType = null;
  set({ revision: get().revision + 1 });
}

/** Change the drafting settings the commands read (an annotation type applying its options, the symbol to place…). */
export function patchDraftSettings(patch: Partial<DraftSettings>): void {
  Object.assign(settings, patch);
  set({ revision: get().revision + 1 });
}

export function currentStyles(): { textStyle: string; dimStyle: string } {
  return { textStyle: settings.currentTextStyle, dimStyle: settings.currentDimStyle };
}

const get = () => useDraftingSession.getState();
const set = (patch: Partial<SessionState>) => useDraftingSession.setState(patch);

function say(line: HistoryLine): void {
  set({ history: [...get().history.slice(-(HISTORY_LINES - 1)), line] });
}

/** Echo a line into the command history from outside a command (an action run by a typed alias, #168). */
export function echoLine(key: TranslationKey, params?: Record<string, string | number>): void {
  say({ key, params });
}

/** The view's drafted entities on visible, unlocked layers: what a command sees as already there. */
export function visibleEntities(viewId: string): DraftEntity[] {
  const { drafts, draftLayers } = useProjectStore.getState();
  const usable = new Set(draftLayers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  return draftsOfView(viewId, drafts).filter((d) => usable.has(d.layerId));
}

function context(viewId: string): DraftContext {
  return makeContext(viewId, { ...installedViewInputs(), referenceShapes: referenceShapesIn, elementAt: modelElementAt, elementBoxesAt }, {
    layerId: currentLayerId(),
    axis: get().axis,
    settings: scaledSettings,
    entities: () => visibleEntities(viewId),
    selection: () => get().selection,
    setSelection: (ids) => set({ selection: ids }),
    say: (key, params) => say({ key, params }),
  });
}

let activeLayerId = '0';
export function currentLayerId(): string {
  const layers = useProjectStore.getState().draftLayers;
  return layers.some((l) => l.id === activeLayerId) ? activeLayerId : (layers[0]?.id ?? '0');
}
export function setCurrentLayer(id: string): void {
  activeLayerId = id;
  set({ revision: get().revision + 1 });
}

function refresh(): void {
  set({ prompt: command ? command.prompt() : get().selecting ? { key: 'drafting.prompt.selectObjects' } : null, revision: get().revision + 1 });
}

function finish(result: StepResult): void {
  if (result === 'done') {
    command = null;
    set({ commandId: null });
  }
  refresh();
}

/** Point the session at the view in front (or none). A running command is cancelled on a view change. */
/**
 * Annotation sizes (text height, hatch scale) are model metres on a view; a
 * sheet drafts in paper millimetres, where the same settings read ×10
 * (as on a 1:100 view): 0.25 m text is 2.5 mm on paper.
 */
let sizeScale = 1;

/** How many drawing units a settings unit of size (text height, hatch scale) is on the current target: 1 on a view, 10 on a sheet. */
export const draftSizeScale = (): number => sizeScale;

/** The settings as commands see them on the current target. */
const scaledSettings = scaledDraftSettings(settings, () => sizeScale);

/** Where typed absolute coordinates count from, in drawing space (`frame.ts`). */
let userOrigin: Pt = { x: 0, y: 0 };
export function attachDraftingView(viewId: string | null, axis: SectionAxisName, references: (min: Pt, max: Pt) => DraftShape[], unitsScale = 1, origin: Pt = { x: 0, y: 0 }): void {
  userOrigin = origin;
  setReferenceProvider(references);
  sizeScale = unitsScale;
  // Plans draw drawing-y downward on screen; text and marks grow up on screen.
  const frame = annotationFrameOf(axis);
  setAnnotationScreenUp(frame.up);
  setAnnotationScreenRight(frame.right);
  if (get().viewId === viewId && get().axis === axis) return;
  if (get().viewId !== viewId) cancelCommand();
  set({ viewId, axis, selection: get().viewId === viewId ? get().selection : new Set() });
}

export function runningCommand(): DraftCommand | null {
  return command;
}

/** Start (or, for a one-action command, run) a command, cancelling the one that is running. False when there is no such command here or no view in front. */
export function startDraftCommand(id: string, args = ''): boolean {
  const def = draftCommandById(id);
  const viewId = get().viewId ?? (def?.projectWide ? '' : null);
  if (!def || viewId === null) return false;
  cancelCommand();
  endedByUser = false;
  say({ key: def.labelKey });
  // Enter repeats a drawing command; it must not issue the set again.
  if (!def.projectWide) set({ lastCommandId: def.id });
  if (def.needsSelection && get().selection.size === 0) {
    pending = def;
    set({ selecting: true, commandId: def.id });
    refresh();
    return true;
  }
  if (def.run) def.run(context(viewId), args);
  else begin(def, viewId);
  refresh();
  return true;
}

function begin(def: DraftCommandDef, viewId: string): void {
  pending = null;
  command = def.create(context(viewId));
  set({ commandId: def.id, selecting: false });
  refresh();
}

export function cancelCommand(): void {
  if (command || pending) say({ key: 'drafting.msg.cancelled' });
  command = null;
  pending = null;
  set({ commandId: null, selecting: false });
  refresh();
}

/** The entity nearest to `p` within `tolerance` drawing units. */
export function pickEntity(p: Pt, tolerance: number): DraftEntity | null {
  const { viewId } = get();
  if (!viewId) return null;
  let best: DraftEntity | null = null;
  let bestDist = tolerance;
  for (const entity of visibleEntities(viewId)) {
    const d = nearestOnEntity(entity.shape, p).dist;
    if (d <= bestDist) {
      best = entity;
      bestDist = d;
    }
  }
  return best;
}

/** Ortho constrains a point against the command's base point, while its toggle is on or Ctrl is held. */
export function constrainPoint(p: Pt): Pt {
  return constrainFrom(command?.basePoint() ?? null, p);
}

/** Ortho against any origin (a grip drag measures from the grip's own start), while its toggle is on or Ctrl is held. */
export function constrainFrom(base: Pt | null, p: Pt): Pt {
  return base && (get().ortho || get().orthoHeld) ? applyOrtho(base, p) : p;
}

/** A click on the drawing (already snapped), with the pick tolerance in drawing units. */
export function clickDrawing(p: Pt, tolerance: number, additive: boolean): void {
  const { viewId, selecting } = get();
  if (!viewId) return;
  if (selecting || !command) {
    const hit = pickEntity(p, tolerance);
    // Idle, nothing drafted under the click: the click is for the model's elements.
    if (!hit && !selecting && hasModelPicker()) {
      if (!additive) set({ selection: new Set() });
      pickModel(p, tolerance, additive);
      refresh();
      return;
    }
    const next = new Set(additive || selecting ? get().selection : []);
    if (hit) {
      // The parts of a section symbol are picked and unpicked together.
      const parts = withSectionParts(new Set([hit.id]), visibleEntities(viewId));
      const unpick = next.has(hit.id) && additive;
      for (const id of parts) {
        if (unpick) next.delete(id);
        else next.add(id);
      }
    }
    set({ selection: next });
    refresh();
    return;
  }
  if (command.input() === 'pick') {
    const hit = pickEntity(p, tolerance);
    if (hit && command.onPick) finish(command.onPick(hit, p));
    return;
  }
  if (command.onPoint) finish(command.onPoint(constrainPoint(p)));
}

/** Window (fully inside) or crossing (touching) selection of a drawn rectangle. */
export function windowSelect(a: Pt, b: Pt, crossing: boolean, additive: boolean): void {
  const { viewId } = get();
  if (!viewId) return;
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const next = new Set(additive || get().selecting ? get().selection : []);
  for (const entity of visibleEntities(viewId)) {
    const bb = entityBounds(entity.shape);
    const inside = bb.min.x >= min.x && bb.max.x <= max.x && bb.min.y >= min.y && bb.max.y <= max.y;
    const touches = bb.max.x >= min.x && bb.min.x <= max.x && bb.max.y >= min.y && bb.min.y <= max.y;
    if (inside || (crossing && touches)) next.add(entity.id);
  }
  set({ selection: withSectionParts(next, visibleEntities(viewId)) });
  refresh();
}

/** Enter: finish the selection / the command, or repeat the last command when idle. */
export function pressEnter(): void {
  const { selecting, viewId, lastCommandId } = get();
  if (selecting && pending && viewId) {
    if (get().selection.size === 0) cancelCommand();
    else begin(pending, viewId);
    return;
  }
  if (command) {
    finish(command.onEnter ? command.onEnter() : 'done');
    return;
  }
  if (lastCommandId) startDraftCommand(lastCommandId);
}

let endedByUser = false;

/**
 * Done: the visible way to end the running command or the object selection it waits for, for
 * a person without Esc or Enter at hand (an iPad, #166). What the command has drafted stays,
 * as Enter leaves it; a command that Enter would only advance is cancelled. Does nothing when
 * nothing runs (Enter on an idle line would repeat the last command).
 */
export function endCommand(): void {
  if (!command && !pending) return;
  endedByUser = true;
  pressEnter();
  if (command || pending) cancelCommand();
}

/** Whether the last command was ended by {@link endCommand} (a tool that chains must not start again), read once. */
export function takeEndedByUser(): boolean {
  const was = endedByUser;
  endedByUser = false;
  return was;
}

/** Escape: cancel the command, else clear the selection. */
export function pressEscape(): void {
  if (command || pending) cancelCommand();
  else set({ selection: new Set() });
  refresh();
}

/**
 * A command-line entry. Idle: a command name. Running: a keyword, a
 * coordinate (`x,y`, `@dx,dy`, `@d<a`, `d<a`) in the user's screen-aligned
 * frame, or a bare number — a value when the step wants one, otherwise a
 * distance from the base point toward the cursor.
 */
export function submitCommandLine(text: string, cursor: Pt | null): void {
  const trimmed = text.trim();
  if (!trimmed) {
    pressEnter();
    return;
  }
  const idle = !command && !get().selecting;
  const named = namedCommand(trimmed);
  // A project-wide command named while a tool waits for input runs, unless that tool is taking free text.
  if (named && (idle || (named.def.projectWide && !command?.wantsText?.()))) {
    startDraftCommand(named.def.id, named.args);
    return;
  }
  if (idle) {
    say({ key: 'drafting.msg.unknownCommand', params: { name: trimmed } });
    return;
  }
  say({ key: 'drafting.msg.typed', typed: trimmed, params: { text: trimmed } });
  if (!command) return;
  const result = applyTypedLine(command, trimmed, cursor, { axis: get().axis, origin: userOrigin, constrain: constrainPoint });
  if (result === 'invalid') say({ key: 'drafting.msg.invalidInput' });
  else if (result) finish(result);
}

export function toggleOrtho(): void {
  set({ ortho: !get().ortho });
}

/** The view reports Ctrl going down or up (key and pointer events). */
export function setOrthoHeld(held: boolean): void {
  if (get().orthoHeld !== held) set({ orthoHeld: held });
}

export function toggleSnap(): void {
  set({ snap: !get().snap });
}

export function setDraftSelection(ids: ReadonlySet<string>): void {
  set({ selection: ids });
}
