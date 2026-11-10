/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the joinery schedules (door, window, all) a saved project places on its sheets read of the model (#581), for
 * `projectSheetOptions`: each schedule's rows as the app assembles them (`scheduleOf` over the kind's rows: the schedule's content choice,
 * its sub-report, its text rows, and the cells the user typed over the model's text), and the element views its cards draw, cut from the
 * model's meshes. Each kind's rows are read once and every schedule of the kind cuts them, as the app does.
 */

import type { ElementViews } from './joinery-element-views.js';
import { entryViews } from './joinery-entry-views.js';
import { DEFAULT_JOINERY_MAPPING, type JoineryMapping } from './joinery-mapping.js';
import { modelRowsOf } from './joinery-model-rows.js';
import type { JoineryCellOverride } from './joinery-overrides.js';
import { joineryScheduleData, type ScheduleData, type ScheduleKind, type ScheduleModel } from './joinery-schedule.js';
import type { OpenedModel } from './model.js';
import { scheduleModelsOf } from './schedule-models.js';
import { scheduleFilterProperties, scheduleOf, type ProjectSchedule } from './sub-reports.js';
import type { ProjectSet } from './project-set.js';
import type { JoinerySpec } from '@ifc-lite/create';

/** What of a project the joinery schedules read. */
export interface JoineryProjectSource {
  set: ProjectSet;
  schedules: readonly ProjectSchedule[];
  /** The project's joinery catalogue and symbol mapping; absent: none, the default mapping. */
  joineryTypes?: readonly JoinerySpec[];
  joineryMapping?: JoineryMapping;
  symbolFlips?: Record<string, number>;
  /** The cells typed over the model's text (#446). */
  joineryOverrides?: JoineryCellOverride[];
}

/** The element views of the joinery schedules, by schedule id and then entry key. */
export type JoineryViews = ReadonlyMap<string, ReadonlyMap<string, ElementViews>>;

/** The kinds of schedule this file reads. */
export const isJoineryKind = (kind: string): kind is ScheduleKind => kind === 'door' || kind === 'window' || kind === 'all';

/** The scale a schedule's drawings are laid out at: 1:50 when it names none (the app's `scheduleScaleOf`). */
export const joineryScaleOf = (schedule: Pick<ProjectSchedule, 'scale'>): number => schedule.scale ?? 50;

export interface JoineryReads {
  /** The model as a schedule reads it, shared by the rows and the views (its meshes are grouped by element once). */
  models: ScheduleModel[];
  /** The rows of a joinery schedule, as the app's `scheduleDataOf` assembles them. */
  dataOf(schedule: ProjectSchedule): ScheduleData;
  /** The schedules of `source` that a sheet places and that list joinery, once each. */
  placed(): ProjectSchedule[];
}

/** The reads of the joinery schedules of `source` over the opened model; each kind's rows are computed once, and only when a schedule asks. */
export function joineryReads(source: JoineryProjectSource, model: Pick<OpenedModel, 'dataStore' | 'meshes'>, modelName: string): JoineryReads {
  const models = scheduleModelsOf(model, modelName);
  const wholes = new Map<ScheduleKind, ScheduleData>();
  const whole = (kind: ScheduleKind): ScheduleData => {
    let read = wholes.get(kind);
    if (!read) {
      read = joineryScheduleData(
        models, { joineryTypes: source.joineryTypes ?? [], joineryMapping: source.joineryMapping ?? DEFAULT_JOINERY_MAPPING, symbolFlips: source.symbolFlips },
        kind, undefined, scheduleFilterProperties(source.schedules), modelRowsOf(source.schedules.map((s) => s.content)),
      );
      wholes.set(kind, read);
    }
    return read;
  };
  const datas = new Map<string, ScheduleData>();
  return {
    models,
    dataOf(schedule) {
      let data = datas.get(schedule.id);
      if (!data) datas.set(schedule.id, (data = scheduleOf(source.schedules, { id: schedule.id, sub: schedule.sub }, whole(schedule.kind as ScheduleKind), source.joineryOverrides)));
      return data;
    },
    placed() {
      const ids = new Set(source.set.sheets.flatMap((sheet) => (sheet.viewports ?? []).map((vp) => vp.viewId)));
      return source.schedules.filter((s) => isJoineryKind(s.kind) && ids.has(s.id));
    },
  };
}

/**
 * The element views the cards of the placed joinery schedules draw: each type's first occurrence with body geometry, cut at the
 * schedule's scale (`entryViews`, the app's too). A type with none, or a model whose render frame is unknown (read without geometry),
 * draws the generated symbol, as in the app.
 */
export async function joineryViewsOf(reads: JoineryReads, model: Pick<OpenedModel, 'coordinateInfo'>): Promise<JoineryViews> {
  const bounds = model.coordinateInfo?.shiftedBounds;
  const awayFrom = bounds ? { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 } : null;
  // One memo for the build: two schedules of one scale cut a type's window once.
  const cache = new Map<string, Promise<ElementViews | null>>();
  const out = new Map<string, ReadonlyMap<string, ElementViews>>();
  for (const schedule of reads.placed()) {
    out.set(schedule.id, await entryViews(reads.dataOf(schedule).entries, joineryScaleOf(schedule), reads.models, { awayFrom: () => awayFrom, cacheOf: () => cache }));
  }
  return out;
}
