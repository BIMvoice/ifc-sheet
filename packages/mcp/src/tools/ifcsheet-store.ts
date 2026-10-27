/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Per-session state of the `ifcsheet_*` tools: the models opened for drawing
 * sets and the sets laid out on them. Keyed on the session's model registry
 * (one registry per stdio process or HTTP session), so it is collected with
 * the session and one session never sees another's handles.
 */

import type { BoqArticle, ClassificationMapping, DefaultSet, ListScheduleDef, ProjectDocument } from '@bimvoice/ifcsheet';
import type { OpenedModel } from '@bimvoice/ifcsheet/headless';
import type { ModelRegistry, ToolContext } from '../context.js';
import { newHistory, recordEdit, type SetHistory } from './ifcsheet-history.js';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';

/** Opened models keep their meshes in memory, so a session holds a bounded number; the oldest is dropped first. */
export const MAX_SHEET_MODELS = 8;

export interface SheetModelEntry {
  id: string;
  name: string;
  model: OpenedModel;
  /** The IFC as read (the handover package carries it unchanged). */
  bytes: Uint8Array;
  /** Where the IFC was read from, when it came from a file: no tool writes to this path. */
  sourcePath?: string;
  /** SHA-256 (hex) of `bytes`, set on the hosted endpoint, where a session token names its model by it. */
  contentHash?: string;
}

/** A schedule on its own sheet. Its rows are read from the model when the set is drawn, so it is never stale. */
export interface SetSchedule {
  id: string;
  kind: 'rooms' | 'boq' | 'list';
  sheetId: string;
  locale: string;
  /** The project's articles, for a bill of quantities (read from the project file the tool was given). */
  boqArticles?: readonly BoqArticle[];
  /** A table built from the Lists engine (#78): the definition (the elements, the columns, the grouping and the totals) and the schedule's name. */
  /** The project's classification mappings (#89), for a list with an office classification column (#351); read from the project file the tool was given. */
  classificationMappings?: readonly ClassificationMapping[];
  list?: ListScheduleDef;
  name?: string;
}

/** The session's copy of one drawing set. `set` is replaced by every tool that edits it (the document is never mutated in place). */
export interface SheetSetEntry {
  id: string;
  modelId: string;
  /** The model the set is drawn from (kept with the set, so a tool that edits the entry edits the one the next call reads). */
  model: SheetModelEntry;
  set: DefaultSet;
  schedules: SetSchedule[];
  /** What `ifcsheet_undo` and `ifcsheet_redo` walk. A dry run's working copy has its own, empty one. */
  history: SetHistory;
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

export function addSheetModel(ctx: ToolContext, name: string, model: OpenedModel, source: { bytes: Uint8Array; path?: string; contentHash?: string }): SheetModelEntry {
  const store = storeOf(ctx);
  const entry: SheetModelEntry = { id: `sheetmodel-${store.nextModel++}`, name, model, bytes: source.bytes, ...(source.path ? { sourcePath: source.path } : {}), ...(source.contentHash ? { contentHash: source.contentHash } : {}) };
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
  const model = store.models.get(modelId);
  if (!model) throw new ToolExecutionError({ code: ToolErrorCode.MODEL_NOT_FOUND, message: `No drawing-set model '${modelId}'.` });
  const entry: SheetSetEntry = { id: `sheetset-${store.nextSet++}`, modelId, model, set, schedules: [], history: newHistory() };
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

export function getSheetSet(ctx: ToolContext, id: string): SheetSetEntry {
  const store = storeOf(ctx);
  const found = store.sets.get(id);
  if (found && store.models.has(found.modelId)) return found;
  throw new ToolExecutionError({
    code: ToolErrorCode.ENTITY_NOT_FOUND,
    message: `No drawing set '${id}'. Call ifcsheet_generate_set and pass the document_id it returns.`,
    details: { available: [...store.sets.keys()] },
  });
}

/** Puts `document` in the set (the levels and notes stay); the next tool call sees it. The state before is kept for `ifcsheet_undo`. */
export function replaceSheetDocument(entry: SheetSetEntry, document: ProjectDocument): void {
  recordEdit(entry);
  entry.set = { ...entry.set, document };
}

/** Every path an opened model was read from: what no tool may write over. */
export function sourcePaths(ctx: ToolContext): string[] {
  return [...storeOf(ctx).models.values()].flatMap((m) => (m.sourcePath ? [m.sourcePath] : []));
}

/** The set the session made or loaded last (the one `ifcsheet://session/project` shows), or undefined when it holds none. */
export function currentSheetSet(ctx: ToolContext): SheetSetEntry | undefined {
  const store = storeOf(ctx);
  let found: SheetSetEntry | undefined;
  for (const set of store.sets.values()) if (store.models.has(set.modelId)) found = set;
  return found;
}

/** What a hosted session token carries of the store (see `transport/hosted-session.ts`): the live entries and the id counters. */
export function storeContents(ctx: ToolContext): { models: SheetModelEntry[]; sets: SheetSetEntry[]; nextModel: number; nextSet: number } {
  const store = storeOf(ctx);
  return { models: [...store.models.values()], sets: [...store.sets.values()], nextModel: store.nextModel, nextSet: store.nextSet };
}

export function hasSheetModel(ctx: ToolContext, id: string): boolean {
  return storeOf(ctx).models.has(id);
}

/** Puts a model back under the id it had in an earlier request (hosted sessions); the counters move past it so a new handle never repeats an id. */
export function restoreSheetModel(ctx: ToolContext, entry: SheetModelEntry, counters: { nextModel: number; nextSet: number }): void {
  const store = storeOf(ctx);
  store.models.set(entry.id, entry);
  store.nextModel = Math.max(store.nextModel, counters.nextModel);
  store.nextSet = Math.max(store.nextSet, counters.nextSet);
}

/** Puts a set back under its earlier id, on a model `restoreSheetModel` already put back; it starts with an empty undo history. */
export function restoreSheetSet(ctx: ToolContext, id: string, model: SheetModelEntry, set: DefaultSet, schedules: SetSchedule[]): void {
  const store = storeOf(ctx);
  if (!store.sets.has(id)) store.sets.set(id, { id, modelId: model.id, model, set, schedules, history: newHistory() });
}
