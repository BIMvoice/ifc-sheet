/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Per-session state of the `ifcsheet_*` tools: the models opened for drawing
 * sets and the sets laid out on them. Keyed on the session's model registry
 * (one registry per stdio process or HTTP session), so it is collected with
 * the session and one session never sees another's handles.
 */

import type { DefaultSet } from '@bimvoice/ifcsheet';
import type { OpenedModel } from '@bimvoice/ifcsheet/headless';
import type { ModelRegistry, ToolContext } from '../context.js';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';

/** Opened models keep their meshes in memory, so a session holds a bounded number; the oldest is dropped first. */
export const MAX_SHEET_MODELS = 8;

export interface SheetModelEntry {
  id: string;
  name: string;
  model: OpenedModel;
}

export interface SheetSetEntry {
  id: string;
  modelId: string;
  set: DefaultSet;
}

interface SheetStore {
  models: Map<string, SheetModelEntry>;
  sets: Map<string, SheetSetEntry>;
  nextModel: number;
  nextSet: number;
}

const stores = new WeakMap<ModelRegistry, SheetStore>();

function storeOf(ctx: ToolContext): SheetStore {
  let store = stores.get(ctx.registry);
  if (!store) {
    store = { models: new Map(), sets: new Map(), nextModel: 1, nextSet: 1 };
    stores.set(ctx.registry, store);
  }
  return store;
}

export function addSheetModel(ctx: ToolContext, name: string, model: OpenedModel): SheetModelEntry {
  const store = storeOf(ctx);
  const entry = { id: `sheetmodel-${store.nextModel++}`, name, model };
  store.models.set(entry.id, entry);
  while (store.models.size > MAX_SHEET_MODELS) {
    const oldest = store.models.keys().next().value as string;
    store.models.delete(oldest);
    for (const [setId, s] of store.sets) if (s.modelId === oldest) store.sets.delete(setId);
  }
  return entry;
}

export function addSheetSet(ctx: ToolContext, modelId: string, set: DefaultSet): SheetSetEntry {
  const store = storeOf(ctx);
  const entry = { id: `sheetset-${store.nextSet++}`, modelId, set };
  store.sets.set(entry.id, entry);
  return entry;
}

export function getSheetModel(ctx: ToolContext, id: string): SheetModelEntry {
  const store = storeOf(ctx);
  const found = store.models.get(id);
  if (found) return found;
  throw new ToolExecutionError({
    code: ToolErrorCode.MODEL_NOT_FOUND,
    message: `No drawing-set model '${id}'. Call ifcsheet_open_model first and pass the model_id it returns.`,
    details: { available: [...store.models.keys()] },
  });
}

export function getSheetSet(ctx: ToolContext, id: string): SheetSetEntry & { model: SheetModelEntry } {
  const store = storeOf(ctx);
  const found = store.sets.get(id);
  const model = found ? store.models.get(found.modelId) : undefined;
  if (found && model) return { ...found, model };
  throw new ToolExecutionError({
    code: ToolErrorCode.ENTITY_NOT_FOUND,
    message: `No drawing set '${id}'. Call ifcsheet_generate_set and pass the document_id it returns.`,
    details: { available: [...store.sets.keys()] },
  });
}
