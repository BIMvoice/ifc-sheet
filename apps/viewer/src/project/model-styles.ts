/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How each loaded model draws in the project's views (#96). One model is the
 * host and draws as itself; every other model is linked and draws in its own
 * style, halftone by default (lighter pens, lighter fills), the way an
 * architect shows the structure model under the architecture. The setting
 * lives on the project's model list (`ProjectModelRef.role` / `drawStyle`),
 * so it is saved with the project.
 *
 * It is applied last, on top of the category pens and fills the view's
 * graphics already chose (`sheets/viewport-pens.ts`), so a linked model keeps
 * its categories' weights and only goes lighter.
 */

import { useViewerStore } from '@/store';
import type { ProjectModelRef } from './types';
import { useProjectStore } from './project-store';

export type ModelRole = NonNullable<ProjectModelRef['role']>;
export type ModelDrawStyle = NonNullable<ProjectModelRef['drawStyle']>;

export interface ModelDrawing {
  role: ModelRole;
  style: ModelDrawStyle;
}

/** Share of white mixed into a halftone pen or fill. */
export const HALFTONE_MIX = 0.6;

/**
 * Every project model's role and style. The host is the model marked host,
 * else the first in the list (the first loaded: `mergeModels` appends).
 */
export function modelDrawings(refs: readonly ProjectModelRef[]): Map<string, ModelDrawing> {
  const host = refs.find((r) => r.role === 'host') ?? refs[0];
  const out = new Map<string, ModelDrawing>();
  for (const ref of refs) {
    const role: ModelRole = ref === host ? 'host' : 'linked';
    out.set(ref.key, { role, style: ref.drawStyle ?? (role === 'host' ? 'normal' : 'halftone') });
  }
  return out;
}

/** `#rrggbb` mixed toward white by {@link HALFTONE_MIX}; anything else comes back unchanged. */
export function halftoneColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * HALFTONE_MIX).toString(16).padStart(2, '0');
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** What `entityStyles` needs of the viewer: its models, and the canonical global id → model resolver. */
export interface LoadedModelsView {
  models: ReadonlyMap<string, { id: string; name: string; sourceContentHash?: string }>;
  resolveGlobalIdFromModels(globalId: number): { modelId: string } | null;
}

/** A drawing entity's model style, or undefined when it draws normally. */
export type EntityStyleOf = (entityId: number) => ModelDrawStyle | undefined;

/**
 * Drawing entity (a global id) → its model's style. Undefined (draw normally)
 * for a model in the normal style (the host's default), for a model the
 * project does not list, and for everything when fewer than two models are
 * loaded, so a single-model project draws exactly as before.
 */
export function entityStyles(viewer: LoadedModelsView, refs: readonly ProjectModelRef[]): EntityStyleOf | undefined {
  if (viewer.models.size < 2) return undefined;
  const drawings = modelDrawings(refs);
  const byModel = new Map<string, ModelDrawStyle>();
  for (const model of viewer.models.values()) {
    const drawing = drawings.get(model.sourceContentHash ?? model.name);
    if (drawing && drawing.style !== 'normal') byModel.set(model.id, drawing.style);
  }
  if (byModel.size === 0) return undefined;
  const cache = new Map<number, ModelDrawStyle | undefined>();
  return (entityId) => {
    if (cache.has(entityId)) return cache.get(entityId);
    const ref = viewer.resolveGlobalIdFromModels(entityId);
    const style = ref ? byModel.get(ref.modelId) : undefined;
    cache.set(entityId, style);
    return style;
  };
}

/** {@link entityStyles} for the models loaded now and the project as it stands. */
export function currentEntityStyles(): EntityStyleOf | undefined {
  return entityStyles(useViewerStore.getState(), useProjectStore.getState().models);
}

/** Make `key` the host (every other model becomes linked). */
export function setHostModel(key: string): void {
  const { models } = useProjectStore.getState();
  if (!models.some((m) => m.key === key)) return;
  useProjectStore.setState({ models: models.map((m) => ({ ...m, role: m.key === key ? 'host' as const : 'linked' as const })), dirty: true });
}

/** Set how a model draws in the views. */
export function setModelDrawStyle(key: string, drawStyle: ModelDrawStyle): void {
  const { models } = useProjectStore.getState();
  if (!models.some((m) => m.key === key)) return;
  useProjectStore.setState({ models: models.map((m) => (m.key === key ? { ...m, drawStyle } : m)), dirty: true });
}
