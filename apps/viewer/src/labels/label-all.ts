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
import { resolveTemplate } from './label-resolve';
import { parseTemplate } from './label-template';
import type { ViewElement } from './view-elements';

export interface LabelPlacement {
  viewId: string;
  layerId: string;
  textHeight: number;
  textStyle: string;
  dimStyle: string;
}

/** The elements of a view with their GlobalId and class; one a loaded model does not have is left out. */
export function labelTargets(elements: readonly ViewElement[]): LabelTarget[] {
  return elements.flatMap((e) => {
    const guid = renderIdGlobalId(e.renderId);
    const className = guid ? labelElementByGlobalId(guid)?.className() : undefined;
    return guid && className ? [{ guid, className, anchor: e.anchor }] : [];
  });
}

/** The label of `type` for the element `guid`, centred on `centre`; null when the element is not loaded or the type is no label type. */
export function labelDraft(type: AnnotationType, guid: string, centre: Pt, at: LabelPlacement): DraftEntity | null {
  const spec = type.label;
  const element = labelElementByGlobalId(guid);
  if (!spec || !element) return null;
  const text = resolveTemplate(parseTemplate(spec.template), element, spec.missing);
  const shape = { type: 'text' as const, p: centredAnchor(centre, text, at.textHeight, spec.frame, annotationScreenUp()), text, height: at.textHeight, rotation: 0, ...(spec.frame ? { frame: spec.frame } : {}) };
  const styled = styledParams(at.viewId, shape, { textStyle: at.textStyle, dimStyle: at.dimStyle });
  return newDraft(at.viewId, at.layerId, shape, { ...styled, labelOf: guid, atype: type.id });
}
