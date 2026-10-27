/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A saved project's own drawing set (#479): its views, its sheets with their viewports where the user put them, the drafts drawn
 * on the views with the styles and layers they are drawn with, and the view templates the views follow. Read with the readers the
 * app's file reader uses (`set-read.ts`, `draft-read.ts`, `standards-read.ts`, `view-templates-read.ts`), in the order it reads
 * them, so a file the app opens is read the same here and a file it refuses is refused with the same message.
 *
 * `projectSetOf` makes the set `sheetGraphics` draws from it: the document as saved, the levels cut on the model's storeys (as the
 * app's are, from the model it opens). A project with no sheet holds no set; the build then lays out a fresh one.
 */

import type { DefaultSet, SetModel } from './default-set.js';
import type { NumberingScheme, ProjectSheet, ProjectView, ProjectViewTemplate } from './document.js';
import type { DimStyle, TextStyle } from './draft-styles.js';
import type { CustomLineType, LayerGroup } from './draft-look.js';
import { readLineType } from './line-types-read.js';
import { readDraft, readDraftLayer } from './draft-read.js';
import type { DraftEntity, DraftLayer } from './draft-types.js';
import { parsePat, type HatchPattern } from './hatch-pattern.js';
import { nameOf } from './names.js';
import { readIssues } from './issues-read.js';
import { readRevisions } from './revision-read.js';
import type { ProjectIssue } from './issue-types.js';
import type { ProjectRevision } from './revisions.js';
import { readSymbol } from './symbol-read.js';
import type { DraftSymbol } from './symbols.js';
import { readNumberingScheme } from './numbering.js';
import { listAt, readSheet, readView, type Json } from './set-read.js';
import { readDimStyles, readLayerGroups, readTextStyles } from './standards-read.js';
import { levelsFromStoreys } from './view-defaults.js';
import { readViewTemplates } from './view-templates-read.js';

/** What a project file holds of its drawing set. Lists are empty when the file has none. */
export interface ProjectSet {
  views: ProjectView[];
  sheets: ProjectSheet[];
  /** The drafted geometry and annotation, each on one view (or on a sheet, by the sheet's id). */
  drafts: DraftEntity[];
  draftLayers: DraftLayer[];
  textStyles: TextStyle[];
  dimStyles: DimStyle[];
  layerGroups: LayerGroup[];
  /** The project's own line types (#496); empty when it has none. */
  lineTypes: CustomLineType[];
  /** The sets sent out and the revisions of the set: what the drawing register's date and revision columns read. */
  issues: ProjectIssue[];
  revisions: ProjectRevision[];
  viewTemplates: ProjectViewTemplate[];
  /** The hatch patterns the project imported (`hatchPatterns`, PAT text); a hatch may name one. */
  hatchPatterns: HatchPattern[];
  /** The symbols the project holds (`symbols`); a symbol instance names one, or a built-in (`symbols.ts`). */
  symbols: DraftSymbol[];
  sheetNumbering?: NumberingScheme;
}

/** The drawing set of a project file's (parsed, version-checked) object. Throws, with the path, on a view, sheet or draft the app would refuse. */
export function readProjectSet(raw: Json): ProjectSet {
  const at = <T>(key: string, read: (v: unknown, path: string) => T): T[] => listAt(raw, key).map((v, i) => read(v, `/${key}/${i}`));
  const views = at('views', readView);
  const sheets = at('sheets', readSheet);
  const drafts = at('drafts', readDraft);
  const draftLayers = at('draftLayers', readDraftLayer);
  const sheetNumbering = raw.sheetNumbering !== undefined ? readNumberingScheme(raw.sheetNumbering) : undefined;
  return {
    views, sheets, drafts, draftLayers, lineTypes: at('lineTypes', readLineType),
    textStyles: readTextStyles(raw), dimStyles: readDimStyles(raw), layerGroups: readLayerGroups(raw),
    issues: readIssues(raw.issues), revisions: readRevisions(raw.revisions),
    viewTemplates: readViewTemplates(raw.viewTemplates),
    hatchPatterns: typeof raw.hatchPatterns === 'string' ? parsePat(raw.hatchPatterns).patterns : [],
    symbols: at('symbols', readSymbol),
    ...(sheetNumbering ? { sheetNumbering } : {}),
  };
}

/** Whether the project holds a drawing set to print: a sheet at least. */
export const holdsSet = (set: Pick<ProjectSet, 'sheets'> | undefined): boolean => (set?.sheets.length ?? 0) > 0;

/** What of the project, besides its set, the document carries. */
export interface ProjectSetFacts {
  name: string;
  titleBlock?: Record<string, string>;
  includeFarElements?: boolean;
}

/**
 * The project's own set as `sheetGraphics` draws it: the saved views, sheets and templates under the project's name, the plans
 * cut on the levels of `model`'s storeys. `null` when the project holds no sheet, or the model has no geometry to cut.
 */
export function projectSetOf(project: ProjectSetFacts & { set: ProjectSet }, model: Pick<SetModel, 'storeys' | 'extent' | 'projectName'>): DefaultSet | null {
  const { set } = project;
  if (!holdsSet(set) || !model.extent) return null;
  return {
    document: {
      name: project.name || model.projectName || nameOf('names.project.untitled'),
      models: [],
      views: set.views,
      sheets: set.sheets,
      viewTemplates: set.viewTemplates,
      // The drafts carry the revision clouds the title block reads (`revisions.ts`).
      drafts: set.drafts,
      revisions: set.revisions,
      titleBlock: project.titleBlock ?? {},
      ...(set.sheetNumbering ? { sheetNumbering: set.sheetNumbering } : {}),
      ...(project.includeFarElements ? { includeFarElements: true } : {}),
    },
    levels: levelsFromStoreys(model.storeys),
    notes: [],
  };
}
