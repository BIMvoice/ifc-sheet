/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the Wall's keys meet its actions. A stepped-in sheet offers one
 * handler per row of the keymap (`lib/commands/wall-key-commands.ts`); the
 * keyboard dispatcher and the command palette both run an action through
 * {@link runWallCommand}, so a key and a palette row can never do two things.
 * A handler is `null` while its action is not on offer (Fit with a drawing in
 * front, the next sheet on the last one), and then neither is its key or row.
 */

import { useEffect, useRef } from 'react';
import { registerKeyboardCommand } from '@/lib/commands/dispatcher';
import { WALL_KEY_COMMANDS, type WallKeyId } from '@/lib/commands/wall-key-commands';
import { isTextEntryElement } from '@/lib/keyboard-event';

export type WallHandlers = Readonly<Record<WallKeyId, (() => void) | null>>;

/**
 * Whether a key event belongs to something other than the Wall: a text field
 * (a drafting command line included) or a panel that keeps its own keys
 * (`data-owns-keys`). The Wall's keys leave such an event alone.
 */
export function keysBelongElsewhere(target: EventTarget | null): boolean {
  if (isTextEntryElement(target)) return true;
  return target instanceof Element && target.closest('[data-owns-keys]') !== null;
}

let live: { current: WallHandlers } | null = null;

/** Run a Wall action by its key id. False when it is not on offer. */
export function runWallCommand(id: WallKeyId): boolean {
  const handler = live?.current[id];
  if (!handler) return false;
  handler();
  return true;
}

/** The actions on offer now, in keymap order. */
export function availableWallCommands(): WallKeyId[] {
  return WALL_KEY_COMMANDS.map((c) => c.id).filter((id) => Boolean(live?.current[id]));
}

/**
 * Bind every keymap row to the handlers in `handlers` (read at the key press,
 * so they may change on each render). Returns the unbinding.
 */
export function registerWallHandlers(handlers: { current: WallHandlers }): () => void {
  const owner = handlers;
  live = owner;
  const unbind = WALL_KEY_COMMANDS.map(({ id }) => registerKeyboardCommand(id, (event) => {
    if (keysBelongElsewhere(event.target)) return false;
    return runWallCommand(id);
  }, { allowInTextEntry: true }));
  return () => {
    for (const off of unbind) off();
    if (live === owner) live = null;
  };
}

export function useWallKeys(handlers: WallHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => registerWallHandlers(ref), []);
}
