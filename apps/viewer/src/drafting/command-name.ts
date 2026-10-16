/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The command a typed line names: the whole line, or its first word for a command that takes text after its name. */

import { draftCommandByName } from './commands/registry';
import type { DraftCommandDef } from './commands/types';

export function namedCommand(text: string): { def: DraftCommandDef; args: string } | undefined {
  const trimmed = text.trim();
  const whole = draftCommandByName(trimmed);
  if (whole) return { def: whole, args: '' };
  const head = trimmed.split(/\s+/)[0];
  const def = draftCommandByName(head);
  return def?.takesArgs ? { def, args: trimmed.slice(head.length).trim() } : undefined;
}
