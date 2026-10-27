/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet build`: the starting drawing set as PDF, DXF and handover ZIP (#164). The argument checks and the call, as `run` in `cli.ts` had them before the commands became a registry. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { describeTemplateNote, generateDefaultSet, parseSetTemplate, type SetTemplate, type TemplateNoteKey } from '../index.js';
import { dxfName } from '../sheet-file-name.js';
import { buildHandoverZip, type HandoverPart } from '../handover.js';
import { exportDxf, exportPdf, openModel, readProjectFile, sheetGraphics, type ProjectFacts } from '../headless.js';
import { listSchedulesOn, listTableText } from '../cli-list.js';
import { PAC_INTERVENTIONS, PAC_MODES, type PacIntervention, type PacMode } from '../pac-set.js';
import { PAC_DEFAULT_LOCALE, pacPages, pacTemplateFor } from '../cli-pac.js';
import { sheetFormat } from '../units-and-numbers.js';
import { buildStandard, unknownStandardMessage, withTitleBlock } from '../cli-standard.js';
import { type CliIo } from '../cli-command.js';
import { EXIT, type CliCommand } from '../cli-command.js';

interface BuildArgs {
  model: string;
  out?: string;
  handover?: string;
  pattern?: string;
  dxf?: string;
  name?: string;
  template?: string;
  /** The permit project (PAC): its set template, and the opis page first in the PDF. */
  pac?: boolean;
  locale?: string;
  /** With --pac: the works (`PacIntervention`). */
  intervention?: PacIntervention;
  /** With --pac: the permit project (`PacMode`); absent: the --project's, else the full one. */
  pacMode?: PacMode;
  /** A saved project: its list schedules are printed after the build. */
  project?: string;
  includeFarElements?: boolean;
  /** A drawing standard by id (`ro`): its pens and title block layout. */
  standard?: string;
}

async function build(args: BuildArgs, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(args.model));
  } catch (error) {
    io.stderr(`ifcsheet: cannot read ${args.model}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
    return EXIT.failed;
  }
  let setTemplate: SetTemplate | undefined = args.pac ? pacTemplateFor(args.locale ?? PAC_DEFAULT_LOCALE) : undefined;
  if (args.template !== undefined) {
    try {
      setTemplate = parseSetTemplate(await readFile(args.template, 'utf8'));
    } catch (error) {
      io.stderr(`ifcsheet: ${args.template} cannot be used as a set template: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  // The project is read first: its graphic standard and title block layout are what the sheets are drawn with.
  let project: ProjectFacts | undefined;
  if (args.project !== undefined) {
    let projectText: string;
    try { projectText = await readFile(args.project, 'utf8'); } catch (error) {
      io.stderr(`ifcsheet: cannot read ${args.project}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return EXIT.failed;
    }
    try { project = readProjectFile(projectText); } catch (error) {
      io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  // The permit project: --pac-mode, else the project file's (the mode the app saved), else the full one.
  const pacMode: PacMode = args.pacMode ?? project?.pacMode ?? 'full';
  if (args.pac) setTemplate = pacTemplateFor(args.locale ?? PAC_DEFAULT_LOCALE, pacMode);
  const standard = buildStandard(args.standard, project);
  if (!standard) {
    io.stderr(unknownStandardMessage(args.standard ?? ''));
    return EXIT.usage;
  }
  for (const note of standard.notes) io.stderr(`${note}\n`);
  const model = await openModel(bytes, { includeFarElements: args.includeFarElements });
  // The notes a sheet prints (a paper stepped up) are in the language of the PAC words.
  const generated = generateDefaultSet(model, { ...(args.name ? { name: args.name } : {}), ...(setTemplate ? { setTemplate } : {}), ...(args.pac ? { locale: args.locale ?? PAC_DEFAULT_LOCALE } : {}) });
  const set = generated && withTitleBlock(generated, standard);
  if (!set) {
    io.stderr(`ifcsheet: ${args.model} has no geometry to lay a drawing set out on.\n`);
    return EXIT.failed;
  }
  const sheets = await sheetGraphics(set, model, { ...(standard.pens ? { pens: standard.pens } : {}), ...(args.locale ? { locale: args.locale } : {}), ...(project?.unitsAndNumbers ? { units: project.unitsAndNumbers } : {}) });
  const pdf = await exportPdf(args.pac ? pacPages(sheets, set, args.locale ?? PAC_DEFAULT_LOCALE, args.intervention, pacMode) : sheets, { title: set.document.name });
  // What the template's rules met in this model (the other notes are the app's to show).
  for (const note of set.notes) if (note.key.startsWith('setTemplate.')) io.stdout(`${describeTemplateNote({ key: note.key as TemplateNoteKey, params: note.params })}\n`);
  if (args.out) {
    await mkdir(resolve(args.out, '..'), { recursive: true });
    await writeFile(args.out, pdf);
    io.stdout(`${args.out}: ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} (${set.document.name})\n`);
  }
  if (args.handover) {
    // The same builder as the app's package (`handover.ts`): the engine has no schedules or register to add.
    const tokens = { project: set.document.name, date: new Date().toISOString().slice(0, 10) };
    const parts: HandoverPart[] = [
      { kind: 'pdf', extension: 'pdf', tokens: { ...tokens, sheet: set.document.name }, data: pdf },
      ...sheets.map((sheet) => ({ kind: 'dxf' as const, extension: 'dxf', tokens: { ...tokens, number: sheet.number, sheet: sheet.name }, data: new TextEncoder().encode(exportDxf(sheet)) })),
      { kind: 'ifc', extension: 'ifc', tokens: { ...tokens, sheet: basename(args.model).replace(/\.ifc$/i, '') }, data: bytes },
    ];
    const built = buildHandoverZip(args.pattern, parts);
    await mkdir(resolve(args.handover, '..'), { recursive: true });
    await writeFile(args.handover, built.zip);
    io.stdout(`${args.handover}: ${built.files.length} files\n`);
    for (const f of built.files) io.stdout(`  ${f.name}\n`);
  }
  if (args.dxf) {
    await mkdir(args.dxf, { recursive: true });
    const used = new Set<string>();
    for (const sheet of sheets) {
      const file = join(args.dxf, dxfName(sheet.number, used));
      await writeFile(file, exportDxf(sheet));
      io.stdout(`${file}\n`);
    }
  }
  if (project) {
    // The starting set has no schedule sheet (the app composes those): the project's list schedules are printed as text, the table `ifcsheet list` gives.
    try {
      for (const { table } of listSchedulesOn(model, project.schedules, 'en', basename(args.model), project.classificationMappings)) io.stdout(`\n${listTableText(table, sheetFormat('en', standard.unitsAndNumbers))}`);
    } catch (error) {
      io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  return EXIT.ok;
}

export const buildCommand: CliCommand = {
  name: 'build',
  usageRank: 100,
  usage: `  ifcsheet build <model.ifc> [--out <set.pdf>] [--dxf <dir>] [--handover <package.zip>] [--pattern <file names>] [--name <project name>] [--template <office.bvset> | --pac [--locale <ro|en>] [--pac-mode <full|rural>]] [--project <file>] [--standard <id>] [--include-far-elements]`,
  helpRank: 100,
  help: `  build   Lay out the starting drawing set of the model (a plan per level, the
          elevations, the proposed sections) and write it as one PDF, a page per
          sheet. With --dxf, also write one DXF per sheet into that directory.
          With --template, the sheets are made by the rules of a set template (a .bvset file
          saved from a project) instead: the same plan-per-storey, elevation and section
          rules the app applies, a rule the model cannot meet skipped and said.
          With --pac, the sheets are the permit project's (PAC, Legea 169/2026 Anexa 2: plans, facades, sections) and the
          one PDF opens with the opis page: the contents Anexa 2 lists, each with its point and whether the file holds it.
          A --project saved in the app's simplified mode (or --pac-mode rural) builds Anexa 3's sheets instead (1:50 on A3, a
          larger paper for a larger drawing, said on the sheet), without the opis, which is Anexa 2's.`,
  async run(rest, values, io) {
    if (values.csv || values.detail || (values.locale !== undefined && !values.pac)) {
      io.stderr('ifcsheet build has no --csv or --detail, and --locale only with --pac; they are options of boq and rooms.\n');
      return EXIT.usage;
    }
    if (values.json) {
      io.stderr('ifcsheet build has no --json; it is an option of check.\n');
      return EXIT.usage;
    }
    if (values.schedule !== undefined) {
      io.stderr('ifcsheet build has no --schedule; it is an option of list.\n');
      return EXIT.usage;
    }
    const intervention = PAC_INTERVENTIONS.find((i) => i === values.intervention);
    if (values.intervention !== undefined && (!values.pac || !intervention)) {
      io.stderr(values.pac ? `ifcsheet build --intervention is one of ${PAC_INTERVENTIONS.join(', ')}.\n` : 'ifcsheet build has --intervention only with --pac.\n');
      return EXIT.usage;
    }
    const pacMode = PAC_MODES.find((m) => m === values['pac-mode']);
    if (values['pac-mode'] !== undefined && (!values.pac || !pacMode)) {
      io.stderr(values.pac ? `ifcsheet build --pac-mode is one of ${PAC_MODES.join(', ')}.\n` : 'ifcsheet build has --pac-mode only with --pac.\n');
      return EXIT.usage;
    }
    if (values.pac && values.template !== undefined) {
      io.stderr('ifcsheet build --pac sets the sheets itself; it cannot be combined with --template.\n');
      return EXIT.usage;
    }
    if (rest.length !== 1 || (!values.out && !values.handover)) {
      io.stderr(`ifcsheet build needs one model and --out or --handover: ifcsheet build <model.ifc> --out <set.pdf>\n`);
      return EXIT.usage;
    }
    try {
      return await build({ model: rest[0], out: values.out, handover: values.handover, pattern: values.pattern, dxf: values.dxf, name: values.name, template: values.template, project: values.project, includeFarElements: values['include-far-elements'] === true, pac: values.pac === true, locale: values.locale, ...(intervention ? { intervention } : {}), ...(pacMode ? { pacMode } : {}), ...(values.standard !== undefined ? { standard: values.standard } : {}) }, io);
    } catch (error) {
      io.stderr(`ifcsheet: build of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  },
};
