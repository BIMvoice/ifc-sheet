/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a saved project adds to its sheets besides the views (#479): the drafts on the views and the schedules placed on the
 * sheets (the lists, the rooms schedule, the finishes schedule, the bill of quantities, the drawing register), as options of `sheetGraphics`. `ifcsheet build --project` and the MCP server's export of a loaded project both take
 * them from here, so the two print the same sheets. What a sheet holds that the engine does not print yet is reported through
 * `onLeftOut`, never dropped silently.
 */

import { tablesFace } from './draft-look.js';
import type { ProjectSet } from './project-set.js';
import type { ClassificationMapping } from './classification.js';
import type { BoqArticle } from './boq.js';
import { boqResult } from './cli-boq.js';
import { boqSayFor } from './boq-words.js';
import { layoutBoq } from './boq-layout.js';
import { drawingRegisterRows, registerFitOn, registerPaper } from './drawing-register.js';
import { siteFrameOf } from './site-frame.js';
import { listScheduleTableOn } from './list-headless.js';
import type { OpenedModel } from './model.js';
import { layoutRegisterPage } from './register-layout.js';
import { finishLabelsOf, finishesSayFor } from './finishes-words.js';
import { roomScheduleWords } from './room-schedule.js';
import { layoutRoomSchedule } from './room-schedule-layout.js';
import { roomFinishes } from './room-finishes.js';
import { layoutRoomFinishes } from './room-finishes-layout.js';
import { roomInputsOf } from './room-finishes-read.js';
import { layoutTableOnSheet } from './schedule-place.js';
import { scheduleModelsOf } from './schedule-models.js';
import type { SheetGraphicsOptions } from './set-sheets.js';
import { sheetRoomsOf } from './sheet-rooms.js';
import { SCHEDULE_CONTINUED, type PlacedTable, type SchedulePager } from './sheet-schedules.js';
import { registerLabelsOf, roomScheduleLabelsOf, sheetSayFor } from './sheet-words.js';
import type { ProjectSchedule } from './sub-reports.js';
import type { SheetLocale } from './units-and-numbers.js';
import type { UrbanSettings } from './urban-indicators.js';

/** What of a project the sheets draw: its set, its schedules and the classification mappings a list may group by. */
export interface ProjectSheetSource {
  set: ProjectSet;
  schedules: readonly ProjectSchedule[];
  classificationMappings?: readonly ClassificationMapping[];
  /** The bill of quantities' articles (`boq` schedules sum them). */
  boqArticles?: readonly BoqArticle[];
  /** The project's title block values, the register's revision and date read them with the set's issues and revisions. */
  titleBlock?: Record<string, string>;
  /** The urban indicators' settings the room schedule's area summary is measured with. */
  urbanSettings?: UrbanSettings;
}

/** Something a sheet of the project holds that the engine does not print yet, said once per kind and sheet. */
export interface LeftOut {
  sheet: string;
  what: string;
}

/**
 * The `sheetGraphics` options that print a project's drafts and placed list schedules. `language` words the lists (`en`, `ro`);
 * `format` writes their figures and the dimensions' (`sheetFormat` of the language and the project's "Units and numbers").
 */
export function projectSheetOptions(
  project: ProjectSheetSource, model: OpenedModel, language: string, format: SheetLocale, modelName: string,
  onLeftOut: (left: LeftOut) => void = () => {},
): Pick<SheetGraphicsOptions, 'annotations' | 'schedules'> {
  const { set } = project;
  const said = new Set<string>();
  const leaveOut = (sheet: string, what: string) => {
    if (said.has(`${sheet}\n${what}`)) return;
    said.add(`${sheet}\n${what}`);
    onLeftOut({ sheet, what });
  };
  const tables = new Map<string, PlacedTable>();
  const pages = new Map<string, SchedulePager>();
  const say = sheetSayFor(language);
  // What the rooms schedule reads of the model: only when a sheet shows one (the footprints are measured for its area summary).
  let rooms: ReturnType<typeof sheetRoomsOf> | undefined;
  let boq: ReturnType<typeof boqResult> | undefined;
  // The finishes schedule's rooms: read once, and only when a sheet shows one.
  let finishRooms: ReturnType<typeof roomFinishes> | undefined;
  const registerId = project.schedules.find((s) => s.kind === 'register')?.id;
  const registerRows = (): ReturnType<typeof drawingRegisterRows> => drawingRegisterRows({
    sheets: set.sheets, titleBlock: project.titleBlock, issues: set.issues, asIndicated: say('sheets.asIndicated'), schedules: project.schedules, revisions: set.revisions, drafts: set.drafts,
  });
  for (const sheet of set.sheets) {
    for (const vp of sheet.viewports ?? []) {
      const schedule = project.schedules.find((s) => s.id === vp.viewId);
      if (!schedule || tables.has(schedule.id) || pages.has(schedule.id)) continue;
      if (schedule.kind === 'register') {
        // Shrunk to the register's own sheet's drawing area, then split into pages: a viewport shows its own (the app's `useSheetSchedules`).
        const rows = registerRows();
        pages.set(schedule.id, ({ sheets, sheet: on, vp: at }) => layoutRegisterPage(rows, registerLabelsOf(say, schedule.name), registerFitOn(rows.length, (registerId ? registerPaper(sheets, registerId) : null) ?? registerPaper([on], schedule.id)), at.page ?? 0));
        continue;
      }
      if (schedule.kind === 'rooms') {
        rooms ??= sheetRoomsOf(model, project.urbanSettings);
        const read = rooms;
        if (!read.data) { leaveOut(`${sheet.number} ${sheet.name}`.trim(), `the rooms schedule "${schedule.name}" (the model has no room)`); continue; }
        const data = read.data;
        pages.set(schedule.id, (place) => layoutTableOnSheet(place, (paging) => layoutRoomSchedule(data.schedule, roomScheduleLabelsOf(say, roomScheduleWords(language), format, schedule.name, data, read.summary), paging)));
        continue;
      }
      if (schedule.kind === 'boq') {
        boq ??= boqResult(model.dataStore, project.boqArticles ?? []);
        const result = boq;
        const boqSay = boqSayFor(language);
        pages.set(schedule.id, (place) => layoutTableOnSheet(place, (paging) => layoutBoq(result, { locale: format, title: schedule.name, say: boqSay, detail: schedule.detail === true }, paging)));
        continue;
      }
      if (schedule.kind === 'finishes') {
        finishRooms ??= roomFinishes(roomInputsOf(scheduleModelsOf(model, modelName)));
        const read = finishRooms;
        if (read.length === 0) { leaveOut(`${sheet.number} ${sheet.name}`.trim(), `the finishes schedule "${schedule.name}" (the model has no room)`); continue; }
        const finishSay = finishesSayFor(language);
        pages.set(schedule.id, (place) => layoutTableOnSheet(place, (paging) => layoutRoomFinishes(read, finishLabelsOf(finishSay, format, schedule.name), paging)));
        continue;
      }
      if (schedule.kind !== 'list' || !schedule.list) {
        leaveOut(`${sheet.number} ${sheet.name}`.trim(), `the ${schedule.kind} schedule "${schedule.name}"`);
        continue;
      }
      tables.set(schedule.id, {
        name: schedule.name,
        table: listScheduleTableOn(model, { id: schedule.id, name: schedule.name, list: schedule.list }, language, { modelName, classificationMappings: project.classificationMappings ?? [] }),
      });
    }
  }
  // A view's drafts print over the drawing cut from the model (`sheet-graphic.ts`): a drafting or 3D view has none, and the drafts
  // drawn on a sheet itself are on no view, so neither prints. Said here, where the sheets are known, rather than left off unsaid.
  const viewOf = new Map(set.views.map((v) => [v.id, v]));
  const drafted = new Set(set.drafts.map((d) => d.viewId));
  for (const sheet of set.sheets) {
    const where = `${sheet.number} ${sheet.name}`.trim();
    if (drafted.has(sheet.id)) leaveOut(where, 'the drafts drawn on the sheet itself');
    for (const vp of sheet.viewports ?? []) {
      const view = viewOf.get(vp.viewId);
      if (view && (view.kind === 'drafting' || view.kind === '3d') && vp.keyPlanOf === undefined && drafted.has(view.id)) leaveOut(where, `the drafts on the ${view.kind} view "${view.name}"`);
    }
  }
  const tableFace = tablesFace(set.textStyles);
  return {
    annotations: {
      drafts: set.drafts, layers: set.draftLayers, groups: set.layerGroups, lineTypes: set.lineTypes, book: { textStyles: set.textStyles, dimStyles: set.dimStyles }, patterns: set.hatchPatterns, symbols: set.symbols, site: siteFrameOf(model), locale: format,
    },
    schedules: { tables, pages, locale: format, ...(tableFace.styled ? { face: { font: tableFace.font, italic: tableFace.italic } } : {}), ...(SCHEDULE_CONTINUED[language] ? { continued: SCHEDULE_CONTINUED[language] } : {}) },
  };
}
