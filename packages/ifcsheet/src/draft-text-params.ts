/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Linked text (#832): a note or label drafted on a sheet or a view may name a
 * project's text value, `{Cladding}`, and prints with its words, so changing
 * the value changes every note that uses it. The values are the title block's
 * parameters (`title-block-params.ts`), the one bank both the title block and
 * these notes read; a name nobody defined prints `{Name?}`. The app's sheet
 * and the engine's PDF and DXF both resolve through this one function.
 */

import type { DraftEntity } from './draft-types.js';
import { resolveParamText } from './title-block-params.js';

/** `d` as the paper prints it: a text with its `{Name}`s filled in, anything else as it is (the same draft when nothing changed). */
export function resolvedTextDraft(d: DraftEntity, lookup: (name: string) => string | undefined): DraftEntity {
  if (d.shape.type !== 'text') return d;
  const text = resolveParamText(d.shape.text, lookup);
  return text === d.shape.text ? d : { ...d, shape: { ...d.shape, text } };
}

/** `drafts` with every text resolved. */
export const resolvedTextDrafts = (drafts: readonly DraftEntity[], lookup: (name: string) => string | undefined): DraftEntity[] => drafts.map((d) => resolvedTextDraft(d, lookup));
