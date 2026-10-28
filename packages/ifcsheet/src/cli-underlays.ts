/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What `ifcsheet build` says on stderr about the project's underlays (#457). */

import type { ProjectDocument } from './document.js';
import { omittedUnderlayViewNames, printedUnderlays } from './underlay.js';

/**
 * The notes for a document that carries the project's `underlays`: one for each that no sheet of the set prints
 * (the set a build lays out has its own ids, so an underlay that names a view or sheet it does not have cannot
 * print), and with `dxf`, one for each sheet whose DXF leaves a printed underlay out (the PDF prints it; the
 * app's toast says the same).
 */
export function underlayNotes(doc: Pick<ProjectDocument, 'views' | 'sheets' | 'underlays'>, options: { dxf: boolean }): string[] {
  const notes: string[] = [];
  for (const u of doc.underlays ?? []) {
    if (u.opacity <= 0 || (u.printOnSheets?.length ?? 0) === 0) continue;
    const printed = doc.sheets.some((s) => (s.viewports ?? []).some((vp) => vp.viewId === u.viewId) && printedUnderlays([u], u.viewId, s.id).length > 0);
    if (!printed) notes.push(`ifcsheet: the underlay "${u.name}" is not printed: this build's set has no sheet that shows its view (${u.viewId}) and is named in its printOnSheets.`);
  }
  if (options.dxf) {
    for (const sheet of doc.sheets) {
      const views = omittedUnderlayViewNames(sheet, doc.views, doc.underlays);
      if (views.length > 0) notes.push(`ifcsheet: the DXF of sheet ${sheet.number} leaves out the underlay of ${views.join(', ')}; the PDF prints it.`);
    }
  }
  return notes;
}
