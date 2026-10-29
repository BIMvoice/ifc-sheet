/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Every drafting command, looked up by id or by a typed command-line name.
 *
 * A NEW COMMAND is one file and no edited line: `commands/<name>.command.ts`, exporting the commands it defines as
 * `export const draftCommands: readonly DraftCommandDef[] = [...]` (see `./underlay.command.ts`). This file finds every
 * `*.command.ts`, so two PRs adding a command never touch the same line. The list below is FROZEN: nothing is added
 * to it. Ids and typed names are unique across all commands (a clash throws when the registry loads), so the order of
 * the list decides nothing.
 */

import { draftCommandAllowed } from '@/edition-policy';
import { DRAW_COMMANDS } from './draw';
import { MODIFY_COMMANDS } from './modify';
import { CLIPBOARD_COMMANDS } from './clipboard';
import { EDIT_COMMANDS } from './edit';
import { ANNOTATE_COMMANDS } from './annotate';
import { pTextCommand } from './ptext';
import { sectionLineCommand } from './workplane';
import { detailCommand } from './detail';
import { tagCommand } from './tag';
import { reattachCommand } from './reattach';
import { labelAllCommand, labelCommand } from './label';
import { dimAllCommand } from './dimall';
import { DIM_POINT_COMMANDS } from './dim-points';
import { tagAllCommand } from './tagall';
import { ceilTagCommand } from './ceiltag';
import { levelAllCommand } from './level-all';
import { levelAlignCommand } from './level-align';
import { SYMBOL_COMMANDS } from './symbol';
import { checkSetCommand, draftSetCommand, issueCommand } from './set';
import { whatChangedCommand } from './whatchanged';
import { revCloudCommand } from './revcloud';
import type { DraftCommandDef } from './types';

const FROZEN_COMMANDS: readonly DraftCommandDef[] = [...DRAW_COMMANDS, ...MODIFY_COMMANDS, ...CLIPBOARD_COMMANDS, ...EDIT_COMMANDS, ...ANNOTATE_COMMANDS, sectionLineCommand, detailCommand, tagCommand, reattachCommand, labelCommand, labelAllCommand, tagAllCommand, ceilTagCommand, dimAllCommand, ...DIM_POINT_COMMANDS, levelAlignCommand, levelAllCommand, checkSetCommand, draftSetCommand, issueCommand, whatChangedCommand, revCloudCommand, pTextCommand, ...SYMBOL_COMMANDS];

const found = import.meta.glob<{ draftCommands?: readonly DraftCommandDef[] }>('./*.command.ts', { eager: true });

/** `frozen`, then the commands of each `*.command.ts` sorted by id; throws on an id or a typed name two commands share. */
export function assembleCommands(frozen: readonly DraftCommandDef[], registered: readonly DraftCommandDef[]): DraftCommandDef[] {
  const all = [...frozen, ...[...registered].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const c of all) {
    if (ids.has(c.id)) throw new Error(`Two drafting commands share the id "${c.id}".`);
    ids.add(c.id);
    for (const a of c.aliases) {
      if (names.has(a)) throw new Error(`Two drafting commands share the typed name "${a}".`);
      names.add(a);
    }
  }
  return all;
}

export const DRAFT_COMMANDS: readonly DraftCommandDef[] = assembleCommands(FROZEN_COMMANDS, Object.values(found).flatMap((m) => m.draftCommands ?? []));

const BY_ID = new Map(DRAFT_COMMANDS.map((c) => [c.id, c]));
const BY_ALIAS = new Map(DRAFT_COMMANDS.flatMap((c) => c.aliases.map((a) => [a, c] as const)));

/** A drafting command by id — none for one this edition leaves out (commands that build model elements). */
export function draftCommandById(id: string): DraftCommandDef | undefined {
  const command = BY_ID.get(id);
  return command && draftCommandAllowed(command.id) ? command : undefined;
}

/** The command a typed name means (case-insensitive), if any. */
export function draftCommandByName(name: string): DraftCommandDef | undefined {
  const command = BY_ALIAS.get(name.trim().toUpperCase());
  return command && draftCommandAllowed(command.id) ? command : undefined;
}
