/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one source of a tool's help line. The rail shows it as the button's
 * tooltip and the card at the right shows it when the tool is chosen; both
 * ask here, and the line itself is the tool's `bodyKey` in the catalogue, so
 * a tool added to `WALL_TOOLS` or `DRAW_TOOLS` is covered with no second list.
 */

import type { TranslationKey } from '@/i18n';
import { DRAW_TOOLS, WALL_TOOLS } from './wall-actions';

/** The catalogue key of the help line for a rail tool (by its drafting command). */
export function toolHelpKey(command: string): TranslationKey {
  const tool = [...WALL_TOOLS, ...DRAW_TOOLS].find((t) => t.command === command);
  if (!tool) throw new Error(`no help line for the tool "${command}"`);
  return tool.bodyKey;
}
