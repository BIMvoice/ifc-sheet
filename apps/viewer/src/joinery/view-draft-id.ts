/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The id a joinery type's view goes by while it is a drafting target (#492). The drafting commands, session and undo work on entities
 * of a view id; the type's view has none of its own, so the shapes being edited are entities on this id, a working copy of what the
 * type holds (`JoinerySpec.view.drafts`, `view-drafts.ts`). The project file never carries them: the type does.
 */

import type { JoineryViewName } from '@bimvoice/ifcsheet/project';
import type { ProjectDocument } from '@bimvoice/ifcsheet';

const PREFIX = 'joinery:';

export const joineryDraftViewId = (typeId: string, view: JoineryViewName): string => `${PREFIX}${typeId}:${view}`;

export const isJoineryDraftViewId = (viewId: string): boolean => viewId.startsWith(PREFIX);

export function parseJoineryDraftViewId(viewId: string): { typeId: string; view: JoineryViewName } | null {
  if (!isJoineryDraftViewId(viewId)) return null;
  const at = viewId.lastIndexOf(':');
  const view = viewId.slice(at + 1);
  const typeId = viewId.slice(PREFIX.length, at);
  return (view === 'front' || view === 'plan' || view === 'section') && typeId ? { typeId, view } : null;
}

/** The document without the working copy of an open joinery view: the type holds the shapes, so neither the project file nor a package carries the copy. */
export function withoutJoineryDraftViews(doc: ProjectDocument): ProjectDocument {
  return doc.drafts?.some((d) => isJoineryDraftViewId(d.viewId)) ? { ...doc, drafts: doc.drafts.filter((d) => !isJoineryDraftViewId(d.viewId)) } : doc;
}

/**
 * The drafting commands a joinery type's view keeps the result of: the ones that draw or change lines, polylines, circles, arcs, text
 * and hatches (`isJoineryDraftType`). Every other command (dimensions, leaders, levels, axes, symbols, tags, model tools) makes a shape
 * the type does not store, so it is refused there rather than drawn and lost on the next write-back.
 */
export const JOINERY_VIEW_COMMANDS: ReadonlySet<string> = new Set([
  'line', 'polyline', 'rectangle', 'circle', 'arc', 'text', 'hatch',
  'erase', 'move', 'copy', 'rotate', 'mirror', 'offset', 'trim', 'extend', 'fillet',
]);
