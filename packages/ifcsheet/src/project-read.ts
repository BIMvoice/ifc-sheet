/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A saved IfcSheet project (`.ifclite-project.json`) read for the checks that run outside the app (#260): the
 * schedules and their sub-reports, and the joinery catalogue and symbol mapping the schedules' rows depend on.
 * `ifcsheet check --project` and `ifcsheet_check_readiness` build the same findings from it as the app does.
 *
 * Reads only what the checks and the build use. The graphic standard and the title block layout are read for `ifcsheet build`
 * (`graphicStandard`, `titleBlockTemplate`, and the title block's typed values, mapping and parameters); the views and the sheets are not read: no readiness finding
 * depends on them yet (the set-side checks of the app's Check panel do, and are not in the engine). Everything read
 * is read as the app reads it (`readSchedule`, `readJoinerySpec`, `readJoineryMapping` are the app's own readers),
 * and what is malformed is dropped, so an old file, or one with a damaged section, loads with that section empty.
 * A file that is not a project file, or that a newer build wrote, is refused with the app's wording.
 */

import { readJoineryList } from './joinery-spec-read.js';
import { DEFAULT_JOINERY_MAPPING, readJoineryMapping, type JoineryMapping } from './joinery-mapping.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, declaredVersion } from './project-version.js';
import { readSchedule, scheduleFilterProperties, type ProjectSchedule } from './sub-reports.js';
import type { JoinerySpec } from '@ifc-lite/create';
import { joineryScheduleData, type JoineryProject, type ScheduleModel } from './joinery-schedule.js';
import { subReportChecksOf, type SubReportCheck } from './sub-report-check.js';
import { readBoqArticles, boqPropertyNames, type BoqArticle } from './boq.js';
import { boqMissing, computeBoq } from './boq-compute.js';
import { readBoqElements, storeSource } from './boq-read.js';
import { readinessOfModel } from './readiness-read.js';
import type { FarElementFact, ReadinessFinding } from './readiness.js';
import type { IfcDataStore } from '@ifc-lite/parser';
import { readClassificationMappings, type ClassificationMapping } from './classification.js';
import { readUnitsAndNumbers, type UnitsAndNumbers } from './units-and-numbers.js';
import type { MeshData } from '@ifc-lite/geometry';
import { knownGraphicStandard, graphicStandardOf, type GraphicStandard } from './graphic-standard.js';
import { readTitleBlockTemplate } from './title-block-template-read.js';
import type { TitleBlockTemplate } from './title-block-template.js';
import { readTitleBlock, readTitleBlockParams } from './title-block-file-read.js';
import { readTitleSources, type TitleSources } from './title-block-sources.js';
import type { TitleBlockParam } from './title-block-params.js';

/** What the checks read of a project file. */
export interface ProjectFacts extends JoineryProject {
  /** The project's name; empty when the file has none. */
  name: string;
  /** The version the file declares. */
  version: number;
  schedules: ProjectSchedule[];
  joineryTypes: JoinerySpec[];
  joineryMapping: JoineryMapping;
  /** The project's setting "include far-away elements in framing" (`framing.ts`); false when the file does not say so. */
  includeFarElements: boolean;
  /** The bill of quantities' articles (#75); empty when the file has none. */
  boqArticles: BoqArticle[];
  /** The office's classification mappings (#89); empty when the file has none. */
  classificationMappings: ClassificationMapping[];
  /** The project's "Units and numbers" setting (#88), as the app reads it; absent when the file sets none. Hand it to `sheetFormat` for every figure the command line or an export writes. */
  unitsAndNumbers?: UnitsAndNumbers;
  /** The graphic standard the project names (#365), a built-in one other than the default; absent when the file names none or the default. A build draws with its pens. */
  graphicStandard?: GraphicStandard;
  /** The id of a graphic standard the file names that this build does not have (a file from a newer app); the build falls back to the default and says so. */
  unknownGraphicStandard?: string;
  /** The title block layout the project keeps (the Romanian one, or any the app edited); absent: the standard layout. A build prints it on every sheet. */
  titleBlockTemplate?: TitleBlockTemplate;
  /** The title block values typed in the app (project number, designer, the F_01 fields, ...), by field id; absent when the file has none. A typed value beats the model's (`title-block-sources.ts`). */
  titleBlock?: Record<string, string>;
  /** The office's mapping of title block fields to model sources; absent: the defaults. */
  titleBlockSources?: TitleSources;
  /** The project's own title block parameters (`{Name}` in a layout); absent when the file has none. */
  titleBlockParams?: TitleBlockParam[];
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A project file's text, read. Throws an Error with the app's wording when it is not a project file or is newer than this build reads. */
export function readProjectFile(text: string): ProjectFacts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a project file: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!isObject(parsed) || parsed.format !== PROJECT_FILE_FORMAT) throw new Error(`Not a project file: /format must be "${PROJECT_FILE_FORMAT}"`);
  const version = declaredVersion(parsed);
  if (version === null) throw new Error('Not a project file: /version must be a whole number from 1');
  if (version > PROJECT_FILE_VERSION) throw new Error(`Project file version ${version} is newer than this build reads (${PROJECT_FILE_VERSION})`);
  const standard = knownGraphicStandard(parsed.graphicStandard);
  const titleBlockTemplate = readTitleBlockTemplate(parsed.titleBlockTemplate);
  const titleBlock = readTitleBlock(parsed.titleBlock);
  const titleBlockSources = readTitleSources(parsed.titleBlockSources);
  const titleBlockParams = readTitleBlockParams(parsed.titleBlockParams);
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  return {
    name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
    version,
    schedules: list(parsed.schedules).flatMap((s) => readSchedule(s) ?? []),
    joineryTypes: readJoineryList(parsed.joineryTypes),
    joineryMapping: parsed.joineryMapping !== undefined ? readJoineryMapping(parsed.joineryMapping) : { ...DEFAULT_JOINERY_MAPPING },
    includeFarElements: parsed.includeFarElements === true,
    boqArticles: readBoqArticles(parsed.boqArticles),
    classificationMappings: readClassificationMappings(parsed.classificationMappings),
    ...(readUnitsAndNumbers(parsed.unitsAndNumbers) ? { unitsAndNumbers: readUnitsAndNumbers(parsed.unitsAndNumbers) } : {}),
    ...(standard.id !== undefined ? { graphicStandard: graphicStandardOf(standard.id) } : {}),
    ...(standard.unknown !== undefined ? { unknownGraphicStandard: standard.unknown } : {}),
    ...(titleBlockTemplate ? { titleBlockTemplate } : {}),
    ...(titleBlock ? { titleBlock } : {}),
    ...(titleBlockSources ? { titleBlockSources } : {}),
    ...(titleBlockParams?.length ? { titleBlockParams } : {}),
    ...(isObject(parsed.symbolFlips) ? { symbolFlips: Object.fromEntries(Object.entries(parsed.symbolFlips).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isInteger(e[1]) && e[1] >= 1 && e[1] <= 3)) } : {}),
  };
}

/**
 * The sub-report checks of a project over the models: each split schedule's rows (the catalogue and mapping of the
 * project applied, `joineryScheduleData`) against its parts. What `readinessOfModel` takes as its second argument.
 */
export function projectSubReportChecks(project: ProjectFacts, models: readonly ScheduleModel[]): SubReportCheck[] {
  return subReportChecksOf(project.schedules, (kind) => joineryScheduleData(models, project, kind, undefined, scheduleFilterProperties(project.schedules)));
}

/**
 * The readiness findings of an opened model with a project: the model's own, then a pair for each split schedule
 * whose parts overlap or leave elements out. Without a project, `readinessOfModel` alone.
 */
export function readinessWithProject(model: { dataStore: IfcDataStore; storeys: readonly unknown[]; farElements?: readonly FarElementFact[]; meshes?: readonly MeshData[] }, project: ProjectFacts | undefined, modelId = 'model'): ReadinessFinding[] {
  const checks = project ? projectSubReportChecks(project, [{ modelId, dataStore: model.dataStore, view: null }]) : [];
  // What the project's articles take and the model does not state (#75); nothing when the project has no articles.
  const articles = project?.boqArticles ?? [];
  const boq = articles.length > 0 ? boqMissing(computeBoq(readBoqElements(storeSource(modelId, model.dataStore), new Set(boqPropertyNames(articles))), articles)) : undefined;
  return readinessOfModel(model, checks, boq);
}
