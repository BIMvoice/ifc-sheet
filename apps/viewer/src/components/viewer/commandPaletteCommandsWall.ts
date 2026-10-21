/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The palette's rows for the Wall: its actions on a stepped-in sheet (the rows
 * of the keymap, run through the same bus as the keys, with the key written
 * beside them) and, on IfcSheet's own face, the project's sheets by number and
 * name. Choosing a sheet steps into it.
 */

import { FileText, Maximize, PencilRuler, Plus, Printer, StepBack, StepForward } from 'lucide-react';
import { isDocsEdition } from '@/edition';
import { resolveEnglish } from '@/i18n/registry';
import { WALL_KEY_COMMANDS, type WallKeyId } from '@/lib/commands/wall-key-commands';
import type { ProjectSheet } from '@/project/types';
import { availableWallCommands, runWallCommand } from './wall/wall-key-bus';
import { stepInto } from './wall/wall-nav';
import type { Command } from './commandPaletteSearch';

const ICONS: Record<WallKeyId, Command['icon']> = {
  'wall.tool.dimaligned': PencilRuler, 'wall.tool.tag': PencilRuler, 'wall.tool.leader': PencilRuler,
  'wall.tool.level': PencilRuler, 'wall.tool.sectionline': PencilRuler, 'wall.tool.symbol': PencilRuler,
  'wall.draw.line': PencilRuler, 'wall.draw.polyline': PencilRuler, 'wall.draw.circle': PencilRuler,
  'wall.draw.text': PencilRuler, 'wall.draw.hatch': PencilRuler, 'wall.draw.revcloud': PencilRuler, 'wall.draw.ptext': PencilRuler,
  'wall.addDrawing': Plus, 'wall.fit': Maximize, 'wall.print': Printer, 'wall.prevSheet': StepBack, 'wall.nextSheet': StepForward,
};

export function buildWallCommands(sheets: readonly ProjectSheet[], open: (sheetId: string) => void = stepInto): Command[] {
  const on = new Set(availableWallCommands());
  const actions = WALL_KEY_COMMANDS.filter((c) => on.has(c.id)).map((c): Command => ({
    id: `wall:${c.id}`, label: resolveEnglish(c.labelKey), labelKey: c.labelKey,
    runtimeSource: 'wall-action', keywords: 'wall sheet', category: 'Wall', icon: ICONS[c.id], shortcut: c.id,
    action: () => { runWallCommand(c.id); },
  }));
  const rows = isDocsEdition() ? sheets.map((s): Command => ({
    id: `sheet:${s.id}`, label: `${s.number} ${s.name}`, runtimeSource: 'sheet', keywords: 'sheet drawing open',
    category: 'Sheets', icon: FileText, action: () => open(s.id),
  })) : [];
  return [...rows, ...actions];
}
