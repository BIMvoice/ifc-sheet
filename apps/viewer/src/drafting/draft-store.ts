/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drafted entities live in the project document (`useProjectStore.drafts`,
 * saved with the project). Every edit goes through `commitDrafts`, which
 * records the previous array for undo — the arrays are immutable, so a
 * history step costs one reference, not a copy.
 */

import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import type { ProjectDocument, ProjectRevision, ProjectSheet, ProjectView } from '@/project/types';
import { diffById, isEmptyDelta, redoDelta, undoDelta, type Delta } from './step-delta';
import type { DraftEntity, DraftParamValue, EntityShape } from './types';

const HISTORY_LIMIT = 200;

/**
 * One undo step: the drafts as they were, or, for a grouped step that also
 * changed the project's views, sheets or revision records (a draft set, a
 * revision removed with its clouds), what it added, removed and changed. A
 * grouped step is undone by taking back just that, so whatever was added after
 * it stays. Revision records are kept oldest first, so their order before and
 * after the step is kept too. Whole project fields (`STEP_FIELDS`) are kept as
 * their value before and after.
 */
interface Group {
  drafts: Delta<DraftEntity>;
  views: Delta<ProjectView>;
  sheets: Delta<ProjectSheet>;
  revisions: Delta<ProjectRevision> & { before: string[]; after: string[] };
  /** The project's lists of things with ids that removing a view, sheet, schedule or legend also takes from (`LIST_FIELDS`), each as what the step did to it. */
  lists: ListChange[];
  /** The order of the ids of each list the step added to or removed from, before and after, so a removed item comes back where it was. */
  orders: Orders;
  fields: FieldChange[];
}
type Step =
  | { drafts: DraftEntity[] }
  | { group: Group };

/**
 * Project fields a grouped step may also change, held whole (the title block's parameter list and layout, #143; the fields a standards pack sets, #365): undo puts
 * back the value from before the step only while the field is still the value the step left, the same identity rule the
 * deltas follow, so a step never overwrites what came after it, nor a project opened since.
 */
const STEP_FIELDS = ['titleBlockParams', 'titleBlockTemplate', 'titleBlock', 'titleBlockSources', 'graphicStandard', 'textStyles', 'dimStyles', 'unitsAndNumbers', 'sheetNumbering', 'installedStandard', 'symbolFlips', 'joineryOverrides'] as const;
type StepField = (typeof STEP_FIELDS)[number];
type FieldChange = { [K in StepField]: { key: K; before: ProjectDocument[K]; after: ProjectDocument[K] } }[StepField];

/**
 * Project lists of things with ids that a step may add to, remove from or change (#51): removing a schedule takes its parts and text rows,
 * a legend leaves the sheets, a sheet takes its comments. Kept as deltas like the views and sheets, so undo brings back what the step took
 * and leaves what was added after it.
 */
const LIST_FIELDS = ['schedules', 'legends', 'civilDrawings', 'comments', 'viewTemplates', 'materials'] as const;
type ListField = (typeof LIST_FIELDS)[number];
type ListChange = { [K in ListField]: { key: K; delta: Delta<NonNullable<ProjectDocument[K]>[number]> } }[ListField];

/** `delta` applied to the list `key` of `s`, as a state patch; nothing when the step did not touch it (an absent list stays absent). */
function listsPatch(s: ProjectDocument, lists: readonly ListChange[], apply: (current: readonly { id: string }[], d: Delta<{ id: string }>) => { id: string }[]): Partial<ProjectDocument> {
  const out: Record<string, unknown> = {};
  for (const c of lists) out[c.key] = apply((s[c.key] ?? []) as readonly { id: string }[], c.delta as Delta<{ id: string }>);
  return out as Partial<ProjectDocument>;
}

type OrderedKey = 'drafts' | 'views' | 'sheets' | ListField;
type Orders = Partial<Record<OrderedKey, { before: string[]; after: string[] }>>;
const ORDERED_KEYS: readonly OrderedKey[] = ['drafts', 'views', 'sheets', ...LIST_FIELDS];
const idsOf = (list: readonly { id: string }[] | undefined): string[] => (list ?? []).map((t) => t.id);

/** `patch` with every list the step added to or removed from put in the order it had `at` the step. */
function ordered(patch: Partial<ProjectDocument>, orders: Orders, at: 'before' | 'after'): Partial<ProjectDocument> {
  const out: Record<string, unknown> = { ...patch };
  for (const key of ORDERED_KEYS) {
    const order = orders[key];
    const list = out[key] as { id: string }[] | undefined;
    if (order && list) out[key] = inOrder(list, order[at]);
  }
  return out as Partial<ProjectDocument>;
}

let past: Step[] = [];
let future: Step[] = [];
/** When each step was made (ms), so a plan's undo can interleave drafting and model steps in the order they happened. */
let pastAt: number[] = [];
let futureAt: number[] = [];
/** While a grouped step runs, individual commits do not make steps of their own. */
let grouping = false;
/** When the step Undo would revert was made, or null when there is none. */
export const lastDraftStepAt = (): number | null => pastAt.at(-1) ?? null;
/** When the step Redo would restore was made, or null when there is none. */
export const nextDraftRedoAt = (): number | null => futureAt.at(-1) ?? null;

function pushStep(step: Step): void {
  past = [...past.slice(-(HISTORY_LIMIT - 1)), step];
  pastAt = [...pastAt.slice(-(HISTORY_LIMIT - 1)), Date.now()];
  future = [];
  futureAt = [];
}

/** Replace the drafts with `next`, as one undoable step. */
export function commitDrafts(next: DraftEntity[]): void {
  const current = useProjectStore.getState().drafts;
  if (next === current) return;
  if (!grouping) pushStep({ drafts: current });
  useProjectStore.setState({ drafts: next, dirty: true });
}

/**
 * Run `change`, which may add views, sheets and drafts through the ordinary
 * functions, and make everything it did ONE undo step: Undo puts the views,
 * sheets and drafts back as they were.
 */
export function runAsOneUndoStep(change: () => void): void {
  const before = useProjectStore.getState();
  const wasGrouping = grouping;
  grouping = true;
  try {
    change();
  } finally {
    grouping = wasGrouping;
  }
  const after = useProjectStore.getState();
  if (wasGrouping) return;
  const revisionsBefore = before.revisions ?? [];
  const revisionsAfter = after.revisions ?? [];
  const fields = STEP_FIELDS.filter((key) => before[key] !== after[key]).map((key) => ({ key, before: before[key], after: after[key] }) as FieldChange);
  const lists = LIST_FIELDS.flatMap((key) => {
    const delta = diffById<{ id: string }>(before[key] ?? [], after[key] ?? []);
    return isEmptyDelta(delta) ? [] : [{ key, delta } as ListChange];
  });
  const orders: Orders = {};
  for (const key of ORDERED_KEYS) {
    if (before[key] === after[key]) continue;
    const delta = diffById<{ id: string }>(before[key] ?? [], after[key] ?? []);
    if (delta.added.length + delta.removed.length > 0) orders[key] = { before: idsOf(before[key]), after: idsOf(after[key]) };
  }
  const group: Group = {
    drafts: diffById(before.drafts, after.drafts), views: diffById(before.views, after.views), sheets: diffById(before.sheets, after.sheets),
    revisions: { ...diffById(revisionsBefore, revisionsAfter), before: revisionsBefore.map((r) => r.id), after: revisionsAfter.map((r) => r.id) },
    lists, orders, fields,
  };
  if (lists.length > 0 || !isEmptyDelta(group.drafts) || !isEmptyDelta(group.views) || !isEmptyDelta(group.sheets) || !isEmptyDelta(group.revisions) || fields.length > 0) pushStep({ group });
}

/**
 * Run `change` as the project's starting state: it changes views, sheets and drafts through the ordinary functions but leaves
 * no undo step, so Undo at the bottom of the history has nothing to take back (the set built when a model opens, #293).
 */
export function runAsStartingState(change: () => void): void {
  const wasGrouping = grouping;
  grouping = true;
  try {
    change();
  } finally {
    grouping = wasGrouping;
  }
}

/**
 * Work that happens in several runs with the page free between them (annotating the whole set, #333), made ONE undo step.
 * Each `run` is synchronous and leaves no step of its own; the drafts it adds, removes or changes are kept, and `close`
 * records them as one grouped step. Anything the user does between two runs makes its own step and is not in this one, so
 * Undo takes back just what the runs did.
 */
export interface UndoSpan {
  run(change: () => void): void;
  close(): void;
}

export function openUndoSpan(): UndoSpan {
  const delta: Delta<DraftEntity> = { added: [], removed: [], changed: [] };
  return {
    run(change) {
      const before = useProjectStore.getState().drafts;
      try {
        runAsStartingState(change);
      } finally {
        // What a run did before it failed is part of the step too.
        const d = diffById(before, useProjectStore.getState().drafts);
        delta.added.push(...d.added);
        delta.removed.push(...d.removed);
        delta.changed.push(...d.changed);
      }
    },
    close() {
      if (isEmptyDelta(delta)) return;
      const none = <T extends { id: string }>(): Delta<T> => ({ added: [], removed: [], changed: [] });
      pushStep({ group: { drafts: delta, views: none(), sheets: none(), revisions: { ...none<ProjectRevision>(), before: [], after: [] }, lists: [], orders: {}, fields: [] } });
    },
  };
}

/** The fields `changes` set back to `to`, each only where it still holds the value the step moved it `from`. */
function fieldsBack(s: ProjectDocument, changes: readonly FieldChange[], from: 'before' | 'after', to: 'before' | 'after'): Partial<ProjectDocument> {
  const out: Partial<Record<StepField, unknown>> = {};
  for (const c of changes) if (s[c.key] === c[from]) out[c.key] = c[to];
  return out as Partial<ProjectDocument>;
}

/** `list` in the order of the ids in `order`; anything not in it after, as it was. */
function inOrder<T extends { id: string }>(list: T[], order: readonly string[]): T[] {
  const at = new Map(order.map((id, i) => [id, i]));
  return list.map((t, i) => ({ t, k: at.get(t.id) ?? order.length + i })).sort((a, b) => a.k - b.k).map((x) => x.t);
}

/** The step Redo needs when `step` is undone: a snapshot step records the state it replaced; a grouped step is its own inverse. */
function currentLike(step: Step): Step {
  return 'group' in step ? step : { drafts: useProjectStore.getState().drafts };
}

function revert(step: Step): void {
  if (!('group' in step)) { useProjectStore.setState({ drafts: step.drafts, dirty: true }); return; }
  const { group } = step;
  useProjectStore.setState((s) => ({
    ...ordered({
      drafts: undoDelta(s.drafts, group.drafts), views: undoDelta(s.views, group.views), sheets: undoDelta(s.sheets, group.sheets),
      ...listsPatch(s, group.lists, undoDelta),
    }, group.orders, 'before'),
    ...(isEmptyDelta(group.revisions) ? {} : { revisions: inOrder(undoDelta(s.revisions ?? [], group.revisions), group.revisions.before) }),
    ...fieldsBack(s, group.fields, 'after', 'before'),
    dirty: true,
  }));
}

function reapply(step: Step): void {
  if (!('group' in step)) { useProjectStore.setState({ drafts: step.drafts, dirty: true }); return; }
  const { group } = step;
  useProjectStore.setState((s) => ({
    ...ordered({
      drafts: redoDelta(s.drafts, group.drafts), views: redoDelta(s.views, group.views), sheets: redoDelta(s.sheets, group.sheets),
      ...listsPatch(s, group.lists, redoDelta),
    }, group.orders, 'after'),
    ...(isEmptyDelta(group.revisions) ? {} : { revisions: inOrder(redoDelta(s.revisions ?? [], group.revisions), group.revisions.after) }),
    ...fieldsBack(s, group.fields, 'before', 'after'),
    dirty: true,
  }));
}

export function undoDrafts(): boolean {
  const previous = past.at(-1);
  if (!previous) return false;
  past = past.slice(0, -1);
  future = [...future, currentLike(previous)];
  futureAt = [...futureAt, pastAt.at(-1) ?? Date.now()];
  pastAt = pastAt.slice(0, -1);
  revert(previous);
  return true;
}

export function redoDrafts(): boolean {
  const next = future.at(-1);
  if (!next) return false;
  future = future.slice(0, -1);
  past = [...past, currentLike(next)];
  pastAt = [...pastAt, futureAt.at(-1) ?? Date.now()];
  futureAt = futureAt.slice(0, -1);
  reapply(next);
  return true;
}

/** Forget the history (another project was loaded). */
export function clearDraftHistory(): void {
  pastAt = [];
  futureAt = [];
  past = [];
  future = [];
}

export function draftsOfView(viewId: string, drafts: readonly DraftEntity[] = useProjectStore.getState().drafts): DraftEntity[] {
  return drafts.filter((d) => d.viewId === viewId);
}

export function newDraft(viewId: string, layerId: string, shape: EntityShape, params: Record<string, DraftParamValue> = {}): DraftEntity {
  return { id: freshProjectId('draft'), viewId, layerId, shape, params };
}

/**
 * One edit: drop `remove`, swap shapes of `update` (same id, same params),
 * append `add`. Returns the ids of the added entities.
 */
export function editDrafts(edit: {
  add?: DraftEntity[];
  update?: ReadonlyMap<string, EntityShape>;
  remove?: ReadonlySet<string>;
}): string[] {
  const { drafts } = useProjectStore.getState();
  const remove = edit.remove ?? new Set<string>();
  const update = edit.update ?? new Map<string, EntityShape>();
  const next = drafts
    .filter((d) => !remove.has(d.id))
    .map((d) => {
      const shape = update.get(d.id);
      return shape ? { ...d, shape } : d;
    });
  const added = edit.add ?? [];
  if (added.length === 0 && remove.size === 0 && update.size === 0) return [];
  commitDrafts([...next, ...added]);
  return added.map((d) => d.id);
}

/** One undoable step that swaps a whole entity (its shape and its params) for `next`, found by id. */
export function replaceDraft(next: DraftEntity): void {
  const { drafts } = useProjectStore.getState();
  if (!drafts.some((d) => d.id === next.id)) return;
  commitDrafts(drafts.map((d) => (d.id === next.id ? next : d)));
}

export function setDraftParams(ids: ReadonlySet<string>, params: Record<string, DraftParamValue | null>): void {
  const { drafts } = useProjectStore.getState();
  commitDrafts(drafts.map((d) => {
    if (!ids.has(d.id)) return d;
    const merged: Record<string, DraftParamValue> = { ...d.params };
    for (const [key, value] of Object.entries(params)) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    return { ...d, params: merged };
  }));
}

export function setDraftLayer(ids: ReadonlySet<string>, layerId: string): void {
  const { drafts } = useProjectStore.getState();
  if (!drafts.some((d) => ids.has(d.id) && d.layerId !== layerId)) return;
  commitDrafts(drafts.map((d) => (ids.has(d.id) ? { ...d, layerId } : d)));
}
