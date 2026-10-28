/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block values of a saved project that do not fit their cell, for the checks that run outside the app
 * (`ifcsheet check --project`, the MCP readiness tool). The judgement is `titleBlockMisfits`, i.e. the `fitCell` the
 * layout itself prints with; this file only reads the sheets a project file holds and resolves each sheet's values as the
 * app does (the typed values over the model's, the sheet's own over them, the scale and the revision the sheet states).
 * Read leniently, as the other project readers are: a malformed sheet, view or revision is dropped.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import type { ProjectSheet, ProjectView } from './document.js';
import { sheetScaleLine } from './sheet-scale.js';
import { currentRevisionOf, type ProjectRevision, type RevisionDraft } from './revisions.js';
import { readSheetParams, readTitleBlock } from './title-block-file-read.js';
import { fieldBuiltins, paramLookup, type TitleBlockParam } from './title-block-params.js';
import { titleBlockOf } from './title-block-fields.js';
import { titleBlockMisfits, type TitleBlockMisfit } from './title-block-print.js';
import { readStoreFacts } from './title-block-records.js';
import { projectTitleFields, type TitleSources } from './title-block-sources.js';
import type { TitleBlockTemplate } from './title-block-template.js';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** What a title block reads of a project's sheets: the sheets, the views (a perspective has no scale), the schedules' ids (no drawing), the revisions and the clouds that name them. */
export interface ProjectSheets {
  sheets: ProjectSheet[];
  views: ProjectView[];
  scheduleIds: string[];
  revisions: ProjectRevision[];
  drafts: RevisionDraft[];
}

/** The sheets of a project file's parsed JSON, as far as a title block reads them. */
export function readProjectSheets(parsed: Json): ProjectSheets {
  const sheets = list(parsed.sheets).flatMap((raw): ProjectSheet[] => {
    if (!isObject(raw) || !isString(raw.id) || !isString(raw.number) || !isString(raw.name)) return [];
    const titleBlock = readTitleBlock(raw.titleBlock);
    const titleBlockParams = readSheetParams(raw.titleBlockParams);
    const viewports = list(raw.viewports).flatMap((v) => (isObject(v) && isString(v.viewId) && typeof v.scale === 'number' ? [{ viewId: v.viewId, scale: v.scale }] : []));
    return [{
      id: raw.id, number: raw.number, name: raw.name, createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
      ...(viewports.length > 0 ? { viewports: viewports as ProjectSheet['viewports'] } : {}),
      ...(titleBlock ? { titleBlock } : {}),
      ...(titleBlockParams ? { titleBlockParams } : {}),
      ...(Array.isArray(raw.revisionIds) ? { revisionIds: raw.revisionIds.filter(isString) } : {}),
    }];
  });
  // Only the 3D views matter to a scale (`hasTrueScale`), and only their projection.
  const views = list(parsed.views).flatMap((v) => (isObject(v) && isString(v.id) && isString(v.kind) ? [v as unknown as ProjectView] : []));
  const revisions = list(parsed.revisions).flatMap((r): ProjectRevision[] => (isObject(r) && isString(r.id) && isString(r.code) ? [{ id: r.id, code: r.code, date: isString(r.date) ? r.date : '', description: isString(r.description) ? r.description : '', by: isString(r.by) ? r.by : '' }] : []));
  const drafts = list(parsed.drafts).flatMap((d): RevisionDraft[] => (isObject(d) && isString(d.viewId) && isObject(d.params) ? [{ viewId: d.viewId, params: d.params }] : []));
  return { sheets, views, scheduleIds: list(parsed.schedules).flatMap((s) => (isObject(s) && isString(s.id) ? [s.id] : [])), revisions, drafts };
}

/** What the misfit judgement reads of a project. */
export interface TitleBlockFitProject extends Partial<ProjectSheets> {
  name: string;
  titleBlockTemplate?: TitleBlockTemplate;
  titleBlock?: Record<string, string>;
  titleBlockSources?: TitleSources;
  titleBlockParams?: TitleBlockParam[];
}

/** The title block values of the project's saved sheets that the project's layout cuts short; none while the project keeps the standard layout, which wraps nothing. `asIndicated` is the scale line of a sheet of mixed scales. */
export function projectTitleBlockMisfits(project: TitleBlockFitProject, dataStore: IfcDataStore | undefined, asIndicated = 'As indicated'): TitleBlockMisfit[] {
  const { titleBlockTemplate: template, sheets = [], views = [], scheduleIds = [], revisions = [], drafts = [] } = project;
  if (!template || sheets.length === 0) return [];
  const projectFields = dataStore ? projectTitleFields(project.titleBlock, project.titleBlockSources, readStoreFacts(dataStore)) : project.titleBlock;
  const notDrawings = new Set(scheduleIds);
  return titleBlockMisfits(template, sheets.map((sheet) => {
    const fields = titleBlockOf(sheet, projectFields, project.name);
    const page = sheets.indexOf(sheet) + 1;
    return {
      sheet: `${sheet.number} ${sheet.name}`.trim(),
      lookup: paramLookup(sheet, project.titleBlockParams, {
        ...fieldBuiltins(fields), SheetNumber: sheet.number, SheetName: sheet.name, Scale: sheetScaleLine(sheet, views, notDrawings, asIndicated), Page: `${page}/${sheets.length}`,
        Revision: currentRevisionOf(sheet, { revisions, drafts })?.code ?? '',
      }),
    };
  }));
}
