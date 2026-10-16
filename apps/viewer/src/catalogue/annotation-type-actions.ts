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

/** Make a type the one new annotations draw with: its styles, layer and options become the current ones. Returns the type, or nothing when there is none by that id. */
export function applyAnnotationType(id: string): AnnotationType | undefined {
  const type = annotationTypes().find((t) => t.id === id);
  if (!type) return undefined;
  const effect = typeEffect(type, styleBook(), useProjectStore.getState().draftLayers, currentStyles());
  setCurrentStyles({ textStyle: effect.textStyle, dimStyle: effect.dimStyle, textHeightMm: effect.textHeightMm });
  if (effect.layer) setCurrentLayer(effect.layer);
  patchDraftSettings(effect.settings);
  return type;
}

/** Draw with a type: it becomes the current one and (on a drawing tab) its tool starts. */
export function useAnnotationType(id: string): void {
  const type = applyAnnotationType(id);
  if (type && isDrawingTabActive()) startDraftCommand(type.tool);
}
