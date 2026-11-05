/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Annotate the set" (#333, #707) as a function: TAGALL and DIMALL on every plan, LEVELALL on every elevation and
 * section, planned view by view with no store and no browser. What a view's drawing is, and what the commands read from
 * it (parts, rooms, obstacles, elements, labels), the caller supplies: the app from its open drawings and models, the
 * engine and the CLI from `generateViewDrawings`. The drafts each command plans are kept in a working list, so the next
 * command (and a second run, given the drafts back) sees them and adds only what is missing.
 */

import type { DimAllInputs } from '../dimall/dimall.js';
import { planDimAll } from '../dimall/dimall.js';
import type { DraftEntity, EntityShape } from '../draft-types.js';
import { planLevelAll, type LevelAllInputs } from '../levelall/levelall.js';
import { planTagAll, type TagAllInputs } from '../tagall/tagall.js';
import type { TagParts } from '../tagall/types.js';
import type { SheetLocale } from '../units-and-numbers.js';
import { commandsFor, type AnnotatedKind, type AnnotateChoices, type AnnotateCommand } from './choices.js';
import { messagesOf, outcomeOf, type CommandResult, type Said } from './outcome.js';

export type { AnnotateKey, CommandResult, Outcome, ReasonKey, Said } from './outcome.js';

/** A view the commands run on. */
export interface AnnotateView {
  id: string;
  name: string;
  kind: AnnotatedKind;
  /** Set on a detail: DIMALL is for a whole plan, not for a crop of it. */
  detail?: unknown;
}

/** How the wait for a drawing ended. */
export type DrawingResult<D> = { drawing: D; error?: undefined } | { drawing: null; error: string };

/** What a reader is told: the view, its drawing, the drafts it has now, and where new ids and labels come from. */
export interface ReadCall<V, D> {
  view: V;
  drawing: D;
  /** The view's drafts now: the ones it came with, the run's own added and moved. */
  placed: readonly DraftEntity[];
  newId: () => string;
  locale: SheetLocale;
}

/** What the commands read from a view; each gives the command's complete inputs. */
export interface AnnotateReaders<V, D> {
  /** The drafts the view has before the run. */
  draftsOf(view: V): readonly DraftEntity[];
  dimall(call: ReadCall<V, D>): DimAllInputs;
  /** Null: TAGALL cannot draw (the label types are missing). */
  tagall(call: ReadCall<V, D>): TagAllInputs | null;
  levelall(call: ReadCall<V, D>): LevelAllInputs;
  /** Runs `plan` in whatever frame the view is annotated in (the app's annotation up and right); absent: just runs it. */
  inFrame?<T>(view: V, drawing: D, plan: () => T): T;
}

/** What a command changes of a view's drafts. */
export interface DraftChange {
  add: readonly DraftEntity[];
  /** Drafts moved, by id: the shape each takes. */
  update: ReadonlyMap<string, EntityShape>;
}

/** What happened to one view: each command that was asked of it, or why none ran. */
export interface ViewSummary {
  viewId: string;
  name: string;
  kind: AnnotatedKind;
  /** Set when no command ran: the drawing could not be made. */
  skipped?: Said;
  results: CommandResult[];
}

export interface SetSummary {
  views: ViewSummary[];
  /** Drafted entities added over the whole set. */
  added: number;
  /** The run was stopped before every view was done. */
  cancelled: boolean;
}

export interface AnnotateProgress {
  done: number;
  total: number;
  viewName: string;
}

export interface AnnotateViewsInput<V extends AnnotateView, D> {
  views: readonly V[];
  choices: AnnotateChoices;
  /** Which labels TAGALL places (an annotation preset, #497); absent: every kind. */
  presets?: { tagParts?: TagParts };
  readers: AnnotateReaders<V, D>;
  /** The drawing of a view; it may take a while. */
  drawingOf(view: V): Promise<DrawingResult<D>>;
  newId: () => string;
  locale: SheetLocale;
  signal?: AbortSignal;
  /** The view as it is now; null: it is gone, and is not annotated. Absent: as given. */
  refresh?(planned: V): V | null;
  onProgress?(progress: AnnotateProgress): void;
  /** Before a view is annotated, with the views still to come (the app asks for their drawings ahead). */
  beforeView?(view: V, index: number, targets: readonly V[]): void;
  afterView?(view: V): void;
  /** After a command planned its change, to apply it where the drafts live (the app's undo step). */
  afterCommand?(view: V, command: AnnotateCommand, change: DraftChange): void | Promise<void>;
  /** Between two commands, to let a page paint. */
  pause?(): Promise<void>;
}

/** What the run drafted on one view: the drafts it added (with the later commands' moves applied) and the moves of drafts the view already had. */
export interface ViewDrafts {
  add: DraftEntity[];
  update: Map<string, EntityShape>;
}

export interface AnnotateViewsResult {
  drafts: Map<string, ViewDrafts>;
  summary: SetSummary;
}

interface Planned extends DraftChange {
  messages: Said[];
}

/** The command's inputs read for `call`, and the command planned on them. */
function planCommand<V extends AnnotateView, D>(command: AnnotateCommand, readers: AnnotateReaders<V, D>, call: ReadCall<V, D>, tagParts: TagParts | undefined): Planned {
  const say = (key: Said['key']): Planned => ({ add: [], update: new Map(), messages: [{ key }] });
  if (command === 'dimall') {
    if (call.view.kind !== 'plan') return say('drafting.msg.dimAllPlanOnly');
    // The strings are drawn round the building's outline; a detail cuts the walls at its crop, so its outline is the crop's edge, not a facade.
    if (call.view.detail) return say('drafting.msg.dimAllNotOnDetail');
    return planDimAll(readers.dimall(call));
  }
  if (command === 'tagall') {
    const inputs = readers.tagall(call);
    if (!inputs) return say('drafting.msg.tagAllNeedsTypes');
    return planTagAll(tagParts ? { ...inputs, parts: tagParts } : inputs);
  }
  return planLevelAll(readers.levelall(call));
}

/** One command on one view: what it plans, and how it ended. Throws when the command cannot handle the view. */
export function runAnnotateCommand<V extends AnnotateView, D>(run: {
  readers: AnnotateReaders<V, D>;
  view: V;
  drawing: D;
  command: AnnotateCommand;
  placed: readonly DraftEntity[];
  newId: () => string;
  locale: SheetLocale;
  tagParts?: TagParts | undefined;
}): { change: DraftChange; result: CommandResult } {
  const { readers, view, drawing, command } = run;
  const started = performance.now();
  const call: ReadCall<V, D> = { view, drawing, placed: run.placed, newId: run.newId, locale: run.locale };
  const plan = () => planCommand(command, readers, call, run.tagParts);
  const planned = readers.inFrame ? readers.inFrame(view, drawing, plan) : plan();
  const added = planned.add.length;
  const outcome = outcomeOf(added, planned.messages);
  return { change: planned, result: { command, outcome, added, messages: messagesOf(outcome, planned.messages), ms: performance.now() - started } };
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The working list with `change` applied: moved drafts take their new shape, added ones come last. */
function applied(list: readonly DraftEntity[], change: DraftChange): DraftEntity[] {
  return [...list.map((d) => { const shape = change.update.get(d.id); return shape ? { ...d, shape } : d; }), ...change.add];
}

export async function annotateViews<V extends AnnotateView, D>(input: AnnotateViewsInput<V, D>): Promise<AnnotateViewsResult> {
  const { readers, choices } = input;
  const targets = input.views.filter((v) => commandsFor(v, choices).length > 0);
  const summary: SetSummary = { views: [], added: 0, cancelled: false };
  const drafts = new Map<string, ViewDrafts>();
  for (const [i, planned] of targets.entries()) {
    if (input.signal?.aborted) { summary.cancelled = true; break; }
    const view = input.refresh ? input.refresh(planned) : planned;
    if (!view) continue;
    input.onProgress?.({ done: i, total: targets.length, viewName: view.name });
    input.beforeView?.(view, i, targets);
    const got = await input.drawingOf(view);
    const entry: ViewSummary = { viewId: view.id, name: view.name, kind: view.kind, results: [] };
    if (got.drawing !== null) {
      const drawing = got.drawing;
      let placed: readonly DraftEntity[] = readers.draftsOf(view);
      const before = new Map(placed.map((d) => [d.id, d.shape]));
      // One command at a time, the page free between them: DIMALL after TAGALL on a big plan is a second long.
      for (const command of commandsFor(view, choices)) {
        try {
          const { change, result } = runAnnotateCommand({ readers, view, drawing, command, placed, newId: input.newId, locale: input.locale, tagParts: input.presets?.tagParts });
          await input.afterCommand?.(view, command, change);
          placed = applied(placed, change);
          entry.results.push(result);
        } catch (error) {
          // A command that cannot handle a view does not stop the set: it is said, and the rest go on.
          console.warn(`[annotate] ${command} could not run on ${view.name}`, error);
          entry.results.push({ command, outcome: 'skipped', added: 0, ms: 0, messages: [{ key: 'wall.annotate.reason.failed', params: { error: reasonOf(error) } }] });
        }
        await input.pause?.();
      }
      summary.added += entry.results.reduce((n, r) => n + r.added, 0);
      drafts.set(view.id, {
        add: placed.filter((d) => !before.has(d.id)),
        update: new Map(placed.filter((d) => before.has(d.id) && before.get(d.id) !== d.shape).map((d) => [d.id, d.shape])),
      });
    } else {
      entry.skipped = { key: 'wall.annotate.reason.noDrawing', params: { error: got.error ?? 'error' } };
    }
    summary.views.push(entry);
    input.afterView?.(view);
  }
  input.onProgress?.({ done: summary.views.length, total: targets.length, viewName: '' });
  return { drafts, summary };
}
