/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Placing parametric labels: the draft a label type makes for one element,
 * and the targets (element, class, anchor) of the view in front.
 */

import type { AnnotationType } from '@/catalogue/types';
import { annotationScreenUp } from '@/drafting/annotation';
import { newDraft } from '@/drafting/draft-store';
import type { DraftEntity, Pt } from '@/drafting/types';
import { styledParams } from '@/project/drafting-standards';
import { renderIdGlobalId } from '@/project/element-guid';
import { labelElementByGlobalId } from './label-element';
import { centredAnchor, type LabelTarget } from './label-place';
import { withLeader } from './label-attach';
import { ringToRef } from './label-leader';
import { layoutLabels, type LayoutElement } from './label-layout';
import { rectsOf } from './label-annotations';
import { textBlock } from '@/drafting/text-block';
import { resolveWithExtras, type LabelExtras } from './label-extras';
import type { LabelElement } from './label-resolve';
import { parseTemplate } from './label-template';
import type { ViewElement } from './view-elements';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';

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

/** The elements of a view with their GlobalId and class; one a loaded model does not have is left out. */
export function labelTargets(elements: readonly ViewElement[]): LabelTarget[] {
  return elements.flatMap((e) => {
    const guid = renderIdGlobalId(e.renderId);
    const className = guid ? labelElementByGlobalId(guid)?.className() : undefined;
    return guid && className ? [{ guid, className, anchor: e.anchor, renderId: e.renderId, ring: e.ring }] : [];
  });
}

/** What the label of `type` for the element `guid` says; null when the element is not loaded or the type is no label type. */
/** How a label finds its element by GlobalId: the loaded models'. */
export type ElementReader = (globalId: string) => LabelElement | null;

function labelText(type: AnnotationType, guid: string, locale: SheetLocale, extras: LabelExtras = {}, read: ElementReader = labelElementByGlobalId): string | null {
  const spec = type.label;
  const element = read(guid);
  return spec && element ? resolveWithExtras(parseTemplate(spec.template), element, locale, spec.missing, extras) : null;
}

/** The label of `type` for the element `guid`, centred on `centre`; `ring` is the element's outline, which a leader runs to. Null when the element is not loaded or the type is no label type. */
export function labelDraft(type: AnnotationType, guid: string, centre: Pt, at: LabelPlacement, ring?: readonly Pt[], extras: LabelExtras = {}, read: ElementReader = labelElementByGlobalId): DraftEntity | null {
  const spec = type.label;
  const text = labelText(type, guid, at.locale, extras, read);
  if (!spec || text === null) return null;
  const plain = { type: 'text' as const, p: centredAnchor(centre, text, at.textHeight, spec.frame, annotationScreenUp()), text, height: at.textHeight, rotation: 0, ...(spec.frame ? { frame: spec.frame } : {}) };
  const shape = withLeader(plain, ring ?? null, spec.leader, at.paperUnit);
  const styled = styledParams(at.viewId, shape, { textStyle: at.textStyle, dimStyle: at.dimStyle });
  return newDraft(at.viewId, at.layerId, shape, { ...styled, labelOf: guid, atype: type.id, ...extras, ...(ring ? { labelRef: ringToRef(ring) } : {}) });
}

/** The size a label of `type` for `guid` fills; null as for `labelDraft`. */
export function labelSize(type: AnnotationType, guid: string, textHeight: number, locale: SheetLocale, extras: LabelExtras = {}, read: ElementReader = labelElementByGlobalId): { w: number; h: number } | null {
  const text = labelText(type, guid, locale, extras, read);
  if (text === null) return null;
  const { outer } = textBlock(text, textHeight, type.label?.frame);
  return { w: outer.x1 - outer.x0, h: outer.y1 - outer.y0 };
}

/** Where a label of `type` for `target` goes beside the element, clear of `others` (the view's elements), the annotations on the view and the labels placed before it. */
export function defaultCentres(type: AnnotationType, targets: readonly LabelTarget[], elements: readonly ViewElement[], existing: readonly DraftEntity[], at: LabelPlacement): Map<string, Pt> {
  const items = targets.flatMap((t) => {
    const size = labelSize(type, t.guid, at.textHeight, at.locale);
    return size ? [{ id: String(t.renderId), ring: t.ring, ...size }] : [];
  });
  const scene = {
    elements: elements.map((e): LayoutElement => ({ id: String(e.renderId), ring: e.ring })),
    annotations: rectsOf(existing),
    paperUnit: at.paperUnit,
  };
  const placed = layoutLabels(items, scene);
  return new Map(targets.flatMap((t) => {
    const p = placed.get(String(t.renderId));
    return p ? [[t.guid, p.centre] as [string, Pt]] : [];
  }));
}
