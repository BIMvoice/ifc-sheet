/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Running a registry action by its id (`lib/commands/action-registry.ts`):
 * the drafting view's undo, redo, snap and ortho, and the Wall's actions
 * through their handlers (`wall-key-bus.ts`). The drafting keys and AutoCAD
 * mode's typed aliases (#168) both run actions here, so a key and an alias
 * can never do two different things.
 */

import type { TranslationKey } from '@/i18n';
import { redoEarliest, undoLatest } from '@/project/unified-undo';
import { echoLine, startDraftCommand, toggleOrtho, toggleSnap, useDraftingSession } from '@/drafting/session';
import { clipboardEmpty } from '@/drafting/clipboard';
import { WALL_ACTIONS, type WallActionId } from '@/lib/commands/action-registry';
import { autocadModeOn } from '@/lib/commands/autocad-mode';
import type { DraftingKeyId } from '@/lib/commands/drafting-key-commands';
import { WALL_KEY_COMMANDS, type WallKeyId } from '@/lib/commands/wall-key-commands';
import { availableWallCommands, runWallCommand } from '../wall/wall-key-bus';

/** In AutoCAD mode a toggle says where it now stands in the command line, which screen readers hear. */
function sayToggle(on: boolean, onKey: TranslationKey, offKey: TranslationKey): void {
  if (autocadModeOn()) echoLine(on ? onKey : offKey);
}

const DRAFTING_RUN = {
  'drafting.undo': undoLatest,
  'drafting.redo': redoEarliest,
  'drafting.snap': () => {
    toggleSnap();
    sayToggle(useDraftingSession.getState().snap, 'wall.keys.autocad.snapOn', 'wall.keys.autocad.snapOff');
  },
  'drafting.copy': () => {
    if (useDraftingSession.getState().selection.size > 0) startDraftCommand('copyclip');
  },
  'drafting.paste': () => {
    if (!clipboardEmpty()) startDraftCommand('paste');
  },
  'drafting.duplicate': () => {
    if (useDraftingSession.getState().selection.size > 0) startDraftCommand('duplicate');
  },
  'drafting.ortho': () => {
    toggleOrtho();
    sayToggle(useDraftingSession.getState().ortho, 'wall.keys.autocad.orthoOn', 'wall.keys.autocad.orthoOff');
  },
} as const satisfies Partial<Record<DraftingKeyId, () => void>>;

export type DraftingRunId = keyof typeof DRAFTING_RUN;

/** Undo, redo, snap or ortho, as their keys run them. */
export function runDraftingAction(id: DraftingRunId): void {
  DRAFTING_RUN[id]();
}

const isDraftingRun = (id: string): id is DraftingRunId => Object.hasOwn(DRAFTING_RUN, id);
const WALL_IDS: ReadonlySet<string> = new Set(WALL_KEY_COMMANDS.map((c) => c.id));
const isWallKey = (id: string): id is WallKeyId => WALL_IDS.has(id);

/** Whether the action can run here and now (a Wall action is on offer only on a sheet that offers it). */
export function actionOnOffer(id: WallActionId): boolean {
  if (isDraftingRun(id)) return true;
  return isWallKey(id) && availableWallCommands().includes(id);
}

/** Run the action; false when it is not on offer here. */
export function runRegistryAction(id: WallActionId): boolean {
  if (isDraftingRun(id)) {
    runDraftingAction(id);
    return true;
  }
  return isWallKey(id) && runWallCommand(id);
}

const LABELS: ReadonlyMap<string, TranslationKey> = new Map(WALL_ACTIONS.map((a) => [a.id, a.labelKey]));

/** The action's name, as the shortcut list and the keyboard settings show it. */
export function actionLabelKey(id: WallActionId): TranslationKey {
  return LABELS.get(id) ?? 'drafting.commandLine';
}
