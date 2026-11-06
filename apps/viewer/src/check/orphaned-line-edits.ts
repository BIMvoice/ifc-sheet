/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An edit of a model line (TRIM, EXTEND, FILLET, CHAMFER, #189) hides the model's line in the view and drafts a replacement that
 * carries the hidden entry (`params.replaces`). When the model changes and that line is not in the regenerated drawing, the
 * replacement is stale: one finding per such edit, pointing at the drafted line, which stays on the drawing.
 */

import { entityBounds } from '@/drafting/annotation';
import { hiddenLineEntry } from '@bimvoice/ifcsheet';
import type { CheckInput, Finding } from './types';

export function orphanedLineEdits(input: CheckInput): Finding[] {
  return input.views.flatMap((view): Finding[] => {
    const hidden = view.graphics?.hiddenLines;
    if (!hidden?.length) return [];
    const lines = input.modelLines?.(view.id);
    // A view with no drawing yet cannot be judged: every line would look gone.
    if (!lines) return [];
    const present = new Set(lines.map((l) => hiddenLineEntry(l.globalId, l.line)));
    const sheet = input.sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === view.id));
    return [...new Set(hidden)].filter((entry) => !present.has(entry)).flatMap((entry): Finding[] => {
      const draft = input.drafts.find((d) => d.viewId === view.id && d.params.replaces === entry);
      if (!draft) return [];
      return [{
        kind: 'orphanedLineEdit', key: 'check.orphanedLineEdit', viewId: view.id, sheetId: sheet?.id, draftId: draft.id,
        box: entityBounds(draft.shape), params: { view: view.name, sheet: sheet?.number ?? '' },
      }];
    });
  });
}
