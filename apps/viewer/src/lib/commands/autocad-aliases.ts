/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AutoCAD mode's typed names for actions of the registry (#168). Each row
 * names a registry action by its id (`action-registry.ts`), so a typed alias
 * runs the same function as the action's key and its button.
 *
 * The drafting commands' own names (L, PL, DIM, DLI, CO, CP, M, E, O, TR,
 * EX, C, A, H, T…) live with each command, in its `aliases`
 * (`drafting/commands/*`), and the command line reads them whether this mode
 * is on or off. This table adds names only for registry actions that have
 * none, and a test refuses an alias a drafting command already answers to, so
 * a typed word means one thing.
 */

import type { WallActionId } from './action-registry';

export interface AutocadAlias {
  /** What is typed, upper case. */
  readonly alias: string;
  readonly action: WallActionId;
}

export const AUTOCAD_ALIASES = [
  { alias: 'Z', action: 'wall.fit' },
  { alias: 'ZOOM', action: 'wall.fit' },
  { alias: 'U', action: 'drafting.undo' },
  { alias: 'REDO', action: 'drafting.redo' },
  { alias: 'ORTHO', action: 'drafting.ortho' },
  { alias: 'PLOT', action: 'wall.print' },
  { alias: 'PRINT', action: 'wall.print' },
  { alias: 'PREVIEW', action: 'wall.printPreview' },
  { alias: 'DXFOUT', action: 'wall.exportDxf' },
  { alias: 'MV', action: 'wall.addDrawing' },
  { alias: 'MVIEW', action: 'wall.addDrawing' },
  { alias: 'PAGESETUP', action: 'wall.paper' },
] as const satisfies readonly AutocadAlias[];

const BY_ALIAS: ReadonlyMap<string, WallActionId> = new Map(AUTOCAD_ALIASES.map((a) => [a.alias, a.action]));

/** The registry action a typed word names in AutoCAD mode (case-insensitive), if any. */
export function autocadAliasAction(typed: string): WallActionId | undefined {
  return BY_ALIAS.get(typed.trim().toUpperCase());
}
