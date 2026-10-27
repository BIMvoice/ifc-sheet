/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a saved project adds to its sheets besides the views (#479): the drafts on the views and the list schedules placed on the
 * sheets, as options of `sheetGraphics`. `ifcsheet build --project` and the MCP server's export of a loaded project both take
 * them from here, so the two print the same sheets. What a sheet holds that the engine does not print yet is reported through
 * `onLeftOut`, never dropped silently.
 */

import type { ProjectSet } from './project-set.js';
import type { ClassificationMapping } from './classification.js';
import { siteFrameOf } from './site-frame.js';
import { listScheduleTableOn } from './list-headless.js';
import type { OpenedModel } from './model.js';
import type { SheetGraphicsOptions } from './set-sheets.js';
import { SCHEDULE_CONTINUED, type PlacedTable } from './sheet-schedules.js';
import type { ProjectSchedule } from './sub-reports.js';
import type { SheetLocale } from './units-and-numbers.js';

/** What of a project the sheets draw: its set, its schedules and the classification mappings a list may group by. */
export interface ProjectSheetSource {
  set: ProjectSet;
  schedules: readonly ProjectSchedule[];
  classificationMappings?: readonly ClassificationMapping[];
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
  // The sheet each view hangs on, for saying where a draft was left out.
  const sheetOfView = new Map(set.sheets.flatMap((s) => (s.viewports ?? []).map((vp) => [vp.viewId, `${s.number} ${s.name}`.trim()] as const)));
  const tables = new Map<string, PlacedTable>();
  for (const sheet of set.sheets) {
    for (const vp of sheet.viewports ?? []) {
      const schedule = project.schedules.find((s) => s.id === vp.viewId);
      if (!schedule || tables.has(schedule.id)) continue;
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
  return {
    annotations: {
      drafts: set.drafts, layers: set.draftLayers, groups: set.layerGroups, book: { textStyles: set.textStyles, dimStyles: set.dimStyles }, patterns: set.hatchPatterns, symbols: set.symbols, site: siteFrameOf(model), locale: format,
      onSkipped: (kind, view) => { if (view) leaveOut(sheetOfView.get(view.id) ?? view.name, kindWords(kind)); },
    },
    schedules: { tables, locale: format, ...(SCHEDULE_CONTINUED[language] ? { continued: SCHEDULE_CONTINUED[language] } : {}) },
  };
}

/** What a skipped draft is, in the words the build says it in. */
function kindWords(kind: string): string {
  switch (kind) {
    case 'text': return "a text's frame or leader";
    case 'dimension': return "the leader of a dimension's moved figure";
    case 'symbol': return 'a coordinate point on a georeferenced model';
    default: return `drafted ${kind}s`;
  }
}
