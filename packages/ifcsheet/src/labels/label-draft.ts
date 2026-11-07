/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The parametric label of one element as a drawing entity (#707): its text
 * from the label type's template, its size, its drafted shape. What the app
 * knows and the engine does not comes in through `LabelEnv`: how an element is
 * read, which way is up on screen, how wide a line of text is, the styles a new
 * annotation takes and where a new id comes from.
 */

import type { AnnotationType } from '../annotation-type.js';
import type { DraftEntity, DraftParamValue, EntityShape, Pt } from '../draft-types.js';
import { makeDraft } from '../make-draft.js';
import type { SheetLocale } from '../names.js';
import { textBlock } from '../text-block.js';
import { withLeaderOf, type WidthOf } from './label-attach.js';
import { resolveWithExtras, type LabelExtras } from './label-extras.js';
import { ringToRef } from './label-leader.js';
import { centredAnchor } from './label-place.js';
import type { LabelElement } from './label-resolve.js';
import { parseTemplate } from './label-template.js';

/** How a label finds its element by GlobalId: the loaded models'. */
export type ElementReader = (globalId: string) => LabelElement | null;

export interface LabelPlacement {
  viewId: string;
  layerId: string;
  textHeight: number;
  textStyle: string;
  dimStyle: string;
  /** Drawing units per paper millimetre. */
  paperUnit: number;
  /** The language the label's numbers are written in. */
  locale: SheetLocale;
}

export interface LabelEnv {
  read: ElementReader;
  /** The drawing's screen-up sign. */
  up: 1 | -1;
  /** Measures a line of text in text heights; absent: the table. */
  widthOf?: WidthOf;
  /** The style ids (and an `o.height`) a new annotation takes. */
  styled(viewId: string, shape: EntityShape, current: { textStyle: string; dimStyle: string }): Record<string, DraftParamValue>;
  newId(): string;
}

function labelText(env: LabelEnv, type: AnnotationType, guid: string, locale: SheetLocale, extras: LabelExtras): string | null {
  const spec = type.label;
  const element = env.read(guid);
  return spec && element ? resolveWithExtras(parseTemplate(spec.template), element, locale, spec.missing, extras) : null;
}

/** The label of `type` for the element `guid`, centred on `centre`; `ring` is the element's outline, which a leader runs to. Null when the element is not loaded or the type is no label type. */
export function labelDraft(env: LabelEnv, type: AnnotationType, guid: string, centre: Pt, at: LabelPlacement, ring?: readonly Pt[], extras: LabelExtras = {}): DraftEntity | null {
  const spec = type.label;
  const text = labelText(env, type, guid, at.locale, extras);
  if (!spec || text === null) return null;
  const plain = { type: 'text' as const, p: centredAnchor(centre, text, at.textHeight, spec.frame, env.up, env.widthOf), text, height: at.textHeight, rotation: 0, ...(spec.frame ? { frame: spec.frame } : {}) };
  const shape = withLeaderOf(plain, ring ?? null, spec.leader, at.paperUnit, env.up, env.widthOf);
  const styled = env.styled(at.viewId, shape, { textStyle: at.textStyle, dimStyle: at.dimStyle });
  return makeDraft(shape, { id: env.newId(), viewId: at.viewId, layerId: at.layerId, params: { ...styled, labelOf: guid, atype: type.id, ...extras, ...(ring ? { labelRef: ringToRef(ring) } : {}) } });
}

/** The size a label of `type` for `guid` fills; null as for `labelDraft`. */
export function labelSize(env: LabelEnv, type: AnnotationType, guid: string, textHeight: number, locale: SheetLocale, extras: LabelExtras = {}): { w: number; h: number } | null {
  const text = labelText(env, type, guid, locale, extras);
  if (text === null) return null;
  const { outer } = textBlock(text, textHeight, type.label?.frame, undefined, env.widthOf);
  return { w: outer.x1 - outer.x0, h: outer.y1 - outer.y0 };
}
