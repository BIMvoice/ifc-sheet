/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading a label type's label as a project file stores it: the one reader the app's project and catalogue files and
 * the engine's `ifcsheet build --project` use, so a setting the app saves (the leader's end, the gap, #842) reaches the
 * engine as it reaches the app. Lenient like the rest of an annotation type: a value it does not know is left out.
 */

import { DEFAULT_LABEL, type AnnotationType, type LabelSpec } from '../annotation-type.js';
import { asLeaderEnd, asTextFrame } from '../draft-types.js';
import { TAGALL_TYPES, upgradeTagAllTypes } from '../tagall/types.js';
import { readClassFrames } from './label-frame.js';
import { asLabelGap } from './label-layout.js';
import { asLeaderMode } from './label-leader.js';
import { MISSING_MODES, type MissingMode } from './label-resolve.js';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stored label: its template and what it knows of the rest; undefined when it has no template. The arrow, the absence of an end, is never kept. */
export function readLabelSpec(v: unknown): LabelSpec | undefined {
  if (!isObject(v) || typeof v.template !== 'string') return undefined;
  const frame = asTextFrame(v.frame);
  const classFrames = readClassFrames(v.classFrames);
  const leader = asLeaderMode(v.leader);
  const leaderEnd = asLeaderEnd(v.leaderEnd);
  const gap = asLabelGap(v.gap);
  const missing = (MISSING_MODES as readonly unknown[]).includes(v.missing) ? (v.missing as MissingMode) : DEFAULT_LABEL.missing;
  return {
    template: v.template, missing, ...(frame ? { frame } : {}), ...(classFrames ? { classFrames } : {}), ...(leader ? { leader } : {}),
    ...(leaderEnd && leaderEnd !== 'arrow' ? { leaderEnd } : {}), ...(gap !== undefined ? { gap } : {}),
  };
}

/**
 * TAGALL's two label types as a project file has them (`annotationTypes`): the project's label of the door and window
 * mark and of the room tag where it has one, else the standard type, as the app's TAGALL draws with the project's.
 */
export function projectTagAllTypes(annotationTypes: unknown): { mark: AnnotationType; room: AnnotationType } {
  const stored = Array.isArray(annotationTypes) ? annotationTypes.filter(isObject) : [];
  const types = upgradeTagAllTypes(TAGALL_TYPES.map((t) => {
    const label = readLabelSpec(stored.find((s) => s.id === t.id)?.label);
    return label ? { ...t, label } : t;
  }));
  // `TAGALL_TYPES` is the mark then the room, and both steps keep its order.
  const [mark, room] = types;
  return { mark, room };
}
