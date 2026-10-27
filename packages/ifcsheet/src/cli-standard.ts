/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing standard a `ifcsheet build` draws with (#365): a project's own (`graphicStandard`, `titleBlockTemplate`) or
 * one named with `--standard <id>` (`ro`: the Romanian pack, the same definition the app's "Install standard" applies).
 * A standard names its pens and the title block layout; without either, the build prints what it always printed.
 */

import type { NumberingScheme } from './document.js';
import { graphicStandardOf, type GraphicStandard } from './graphic-standard.js';
import type { DefaultSet } from './default-set.js';
import type { ProjectFacts } from './project-read.js';
import type { ProjectMaterial } from './materials.js';
import { COMMAND_LINE_STANDARD_IDS, packForCommandLine } from './standard-pack.js';
import { withPackMaterials } from './standard-pack-materials.js';
import type { PenTable } from './view-style.js';

/** What the build takes of the chosen standard. */
export interface BuildStandard {
  /** The pens for the drawings; absent: the engine's own table, byte for byte what the build drew before standards. */
  pens?: PenTable;
  /** The layout of every sheet's title block; absent: the standard layout. */
  titleBlockTemplate?: ProjectFacts['titleBlockTemplate'];
  /** The project's "Units and numbers" with the pack's fields over it (the app's install changes only the fields the pack sets); absent: neither sets any. The figures the build prints are written with it. */
  unitsAndNumbers?: ProjectFacts['unitsAndNumbers'];
  /** The numbering scheme of the sheets: the pack's (`--standard`); absent: the default one. */
  sheetNumbering?: NumberingScheme;
  /** What the build says about the choice (a project from a newer app). */
  notes: string[];
}

/** The wording for an id `--standard` does not know. */
export const unknownStandardMessage = (id: string): string => `ifcsheet: unknown standard "${id}". Known standards: ${COMMAND_LINE_STANDARD_IDS.join(', ')}\n`;

const pensOf = (g: GraphicStandard): PenTable => ({ pens: g.pens, weights: g.weights, materialHatch: g.materialHatch });

/**
 * The standard of a build: `--standard` when given (it wins over the project for the parts a pack sets: the pens and the
 * title block), else the project's. Null for an id that is not a known one.
 */
export function buildStandard(standardId: string | undefined, project: ProjectFacts | undefined): BuildStandard | null {
  const notes: string[] = [];
  if (project?.unknownGraphicStandard !== undefined) notes.push(`ifcsheet: the project names the graphic standard "${project.unknownGraphicStandard}", which this version does not have; the default pens are used.`);
  const pack = standardId !== undefined ? packForCommandLine(standardId) : undefined;
  if (standardId !== undefined && !pack) return null;
  const graphic = pack?.graphicStandard !== undefined ? graphicStandardOf(pack.graphicStandard) : project?.graphicStandard;
  const titleBlockTemplate = pack?.titleBlockTemplate ?? project?.titleBlockTemplate;
  const units = pack?.unitsAndNumbers ? { ...project?.unitsAndNumbers, ...pack.unitsAndNumbers } : project?.unitsAndNumbers;
  return { ...(graphic ? { pens: pensOf(graphic) } : {}), ...(pack?.sheetNumbering ? { sheetNumbering: pack.sheetNumbering } : {}), ...(titleBlockTemplate ? { titleBlockTemplate } : {}), ...(units ? { unitsAndNumbers: units } : {}), notes };
}

/**
 * The project's material table with the chosen standard's hatch rows over it (what the app's "Install standard" writes);
 * `table` itself when no standard is chosen or it carries none. The build's PDF and DXF draw no hatches (`sheet-graphic.ts`),
 * so this is the table `ifcsheet materials --standard` reports.
 */
export function materialsUnder(standardId: string | undefined, table: readonly ProjectMaterial[]): readonly ProjectMaterial[] {
  const pack = standardId !== undefined ? packForCommandLine(standardId) : undefined;
  return pack?.materials ? withPackMaterials(table, pack.materials) : table;
}

/** `set` with the standard's title block layout on its document. */
export function withTitleBlock(set: DefaultSet, standard: BuildStandard): DefaultSet {
  return standard.titleBlockTemplate ? { ...set, document: { ...set.document, titleBlockTemplate: standard.titleBlockTemplate } } : set;
}
