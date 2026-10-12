/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Parametric labels follow their elements, as element tags do: a label is a
 * text (`params.labelOf`, the element's GlobalId) stamped with its label type
 * (`params.atype`). When the model changes (a property edited, an element
 * renamed, a load) or the type's template does, every label re-reads its
 * element and takes the new text and frame. The text is derived data, so it
 * changes without an undo step. A label whose element is gone, or whose type
 * is gone, keeps what it last said.
 */

import { useEffect } from 'react';
import type { AnnotationType } from '@/catalogue/types';
import type { DraftEntity } from '@/drafting/types';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { labelElementByGlobalId } from './label-element';
import { resolveTemplate, type LabelElement } from './label-resolve';
import { parseTemplate, type ParsedTemplate } from './label-template';

export const isParametricLabel = (d: DraftEntity): boolean => d.shape.type === 'text' && typeof d.params.labelOf === 'string' && typeof d.params.atype === 'string';

const parsed = new Map<string, ParsedTemplate>();
function templateOf(text: string): ParsedTemplate {
  let t = parsed.get(text);
  if (!t) {
    if (parsed.size > 200) parsed.clear();
    t = parseTemplate(text);
    parsed.set(text, t);
  }
  return t;
}

/** `drafts` with every parametric label brought in line with its element and type; the same array when nothing changed. */
export function settleLabels(drafts: DraftEntity[], types: readonly AnnotationType[], element: (globalId: string) => LabelElement | null): DraftEntity[] {
  let changed = false;
  const next = drafts.map((d) => {
    if (!isParametricLabel(d) || d.shape.type !== 'text') return d;
    const spec = types.find((t) => t.id === d.params.atype)?.label;
    const el = spec ? element(String(d.params.labelOf)) : null;
    if (!spec || !el) return d;
    const text = resolveTemplate(templateOf(spec.template), el, spec.missing);
    if (text === d.shape.text && spec.frame === d.shape.frame) return d;
    changed = true;
    const { frame: _old, ...rest } = d.shape;
    return { ...d, shape: { ...rest, text, ...(spec.frame ? { frame: spec.frame } : {}) } };
  });
  return changed ? next : drafts;
}

export function refreshParametricLabels(): void {
  const { drafts, annotationTypes } = useProjectStore.getState();
  const next = settleLabels(drafts, annotationTypes ?? [], labelElementByGlobalId);
  if (next !== drafts) useProjectStore.setState({ drafts: next, dirty: true });
}

export function useParametricLabelSync(): void {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const types = useProjectStore((s) => s.annotationTypes);
  const count = useProjectStore((s) => s.drafts.filter(isParametricLabel).length);
  useEffect(() => {
    if (count > 0) refreshParametricLabels();
  }, [mutationVersion, models, types, count]);
}
