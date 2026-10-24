/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which annotations lost or changed their element when the model changed: a
 * tag (`tagOf`), a label (`labelOf`), a DIMALL dimension of a door or window width (`measures`; each a GlobalId) and a level mark that
 * reads a storey (`ref.storey`, a GlobalId or the storey's name). Section marks
 * name views (`sectionOf`), not model elements, so they have no element to lose
 * (`main` has no detail marks). Pure.
 */

import type { DraftEntity } from '@/drafting/types';
import type { ModelChange } from './compare';

export interface AnnotationImpact {
  draftId: string;
  viewId: string;
  guid: string;
  /** `lost`: the element is no longer in the model. `changed`: it is, and something about it changed. */
  how: 'lost' | 'changed';
  /** How the element changed (for `changed`). */
  kinds: ModelChange['kinds'];
}

function elementOf(d: DraftEntity): string | null {
  const guid = [d.params.labelOf, d.params.tagOf, d.params.measures].find((g): g is string => typeof g === 'string');
  if (guid) return guid;
  return d.shape.type === 'level' && typeof d.shape.ref?.storey === 'string' ? d.shape.ref.storey : null;
}

export function annotationImpacts(drafts: readonly DraftEntity[], changes: readonly ModelChange[]): AnnotationImpact[] {
  const byGuid = new Map(changes.map((c) => [c.guid, c]));
  return drafts.flatMap((d): AnnotationImpact[] => {
    const guid = elementOf(d);
    const change = guid ? byGuid.get(guid) : undefined;
    return guid && change ? [{ draftId: d.id, viewId: d.viewId, guid, how: change.kinds.includes('removed') ? 'lost' : 'changed', kinds: change.kinds }] : [];
  });
}
