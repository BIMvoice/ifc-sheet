/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Annotation types as project actions: create, change, delete, and draw with one. */

import { currentLayerId, currentStyles, draftSettings, patchDraftSettings, setCurrentLayer, setCurrentStyles, startDraftCommand } from '@/drafting/session';
import { isDrawingTabActive } from '@/project/document-tabs';
import { styleBook } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { captureType, typeEffect } from './annotation-types';
import type { AnnotationTool, AnnotationType } from './types';

export const annotationTypes = (): AnnotationType[] => useProjectStore.getState().annotationTypes ?? [];

/** A new type for `tool` from the settings in force now. Returns its id. */
export function addAnnotationTypeFromCurrent(name: string, tool: AnnotationTool): string {
  const id = freshProjectId('atype');
  const type = captureType(id, name, tool, draftSettings(), currentLayerId());
  useProjectStore.setState({ annotationTypes: [...annotationTypes(), type], dirty: true });
  return id;
}

export function updateAnnotationType(id: string, patch: Partial<Omit<AnnotationType, 'id'>>): void {
  useProjectStore.setState({ annotationTypes: annotationTypes().map((t) => (t.id === id ? { ...t, ...patch } : t)), dirty: true });
}

export function duplicateAnnotationType(id: string, name: string): string | null {
  const source = annotationTypes().find((t) => t.id === id);
  if (!source) return null;
  const copy = { ...structuredClone(source), id: freshProjectId('atype'), name };
  useProjectStore.setState({ annotationTypes: [...annotationTypes(), copy], dirty: true });
  return copy.id;
}

export function removeAnnotationType(id: string): void {
  useProjectStore.setState({ annotationTypes: annotationTypes().filter((t) => t.id !== id), dirty: true });
}

/** Draw with a type: its styles, layer and options become the current ones, and (on a drawing tab) its tool starts. */
export function useAnnotationType(id: string): void {
  const type = annotationTypes().find((t) => t.id === id);
  if (!type) return;
  const effect = typeEffect(type, styleBook(), useProjectStore.getState().draftLayers, currentStyles());
  setCurrentStyles({ textStyle: effect.textStyle, dimStyle: effect.dimStyle, textHeightMm: effect.textHeightMm });
  if (effect.layer) setCurrentLayer(effect.layer);
  patchDraftSettings(effect.settings);
  if (isDrawingTabActive()) startDraftCommand(type.tool);
}
