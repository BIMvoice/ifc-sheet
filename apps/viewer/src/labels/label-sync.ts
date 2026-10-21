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
import { paperUnitOf } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { settleLeader } from './label-attach';
import { labelElementByGlobalId } from './label-element';
import { extrasOf, resolveWithExtras } from './label-extras';
import type { LabelElement } from './label-resolve';
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
export function settleLabels(drafts: DraftEntity[], types: readonly AnnotationType[], element: (globalId: string) => LabelElement | null, paperUnit: (viewId: string) => number = () => 0.1): DraftEntity[] {
  let changed = false;
  const next = drafts.map((d) => {
    if (!isParametricLabel(d) || d.shape.type !== 'text') return d;
    const spec = types.find((t) => t.id === d.params.atype)?.label;
    const el = spec ? element(String(d.params.labelOf)) : null;
    if (!spec) return d;
    let out = d;
    if (el) {
      const text = resolveWithExtras(templateOf(spec.template), el, spec.missing, extrasOf(d.params));
      if (text !== d.shape.text || spec.frame !== d.shape.frame) {
        const { frame: _old, ...rest } = d.shape;
        out = { ...d, shape: { ...rest, text, ...(spec.frame ? { frame: spec.frame } : {}) } };
      }
    }
    // Where the label is, and how big its text now makes it, decide whether it has a leader.
    out = settleLeader(out, spec.leader, paperUnit(d.viewId));
    if (out !== d) changed = true;
    return out;
  });
  return changed ? next : drafts;
}

export function refreshParametricLabels(): void {
  const { drafts, annotationTypes } = useProjectStore.getState();
  const next = settleLabels(drafts, annotationTypes ?? [], labelElementByGlobalId, (viewId) => paperUnitOf(viewId));
  if (next !== drafts) useProjectStore.setState({ drafts: next, dirty: true });
}

export function useParametricLabelSync(): void {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const types = useProjectStore((s) => s.annotationTypes);
  // The sources of the tag fields: a label takes the text the new sources give.
  const tagFields = useProjectStore((s) => s.tagFields);
  const drafts = useProjectStore((s) => s.drafts);
  const count = useProjectStore((s) => s.drafts.filter(isParametricLabel).length);
  // `drafts` too: a label dragged by hand gains or loses its leader. Settling twice changes nothing, so this cannot loop.
  useEffect(() => {
    if (count > 0) refreshParametricLabels();
  }, [mutationVersion, models, types, count, drafts, tagFields]);
}
