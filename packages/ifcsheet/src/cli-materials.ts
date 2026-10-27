/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet materials model.ifc` (#90): the model's materials and how each
 * draws where a view cuts it, with the project's own table applied.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { openModel } from './headless.js';
import { materialReport, materialReportText, readProjectMaterials } from './materials-report.js';
import { materialsUnder, unknownStandardMessage } from './cli-standard.js';
import { packForCommandLine } from './standard-pack.js';
import type { CliIo } from './cli.js';

/** What the command line gave `materials`: the model, and the options it does not take, to refuse. */
export interface MaterialsArgs {
  rest: readonly string[];
  json: boolean;
  project: string | undefined;
  /** `--standard <id>`: the standard's hatch rows laid over the table. */
  standard?: string | undefined;
  /** True when an option `materials` does not take (--out, --dxf, --name, --include-far-elements) was given. */
  foreignOption: boolean;
}

// Exit codes as in `EXIT` of cli.ts (0 ok, 1 failed, 2 usage); not imported, to keep cli.ts and this file free of a cycle at run time.
const OK = 0;
const FAILED = 1;
const USAGE = 2;

/** `ifcsheet materials`: the model's materials and how each draws, with the project's table applied. */
async function materials(file: string, json: boolean, projectFile: string | undefined, standardId: string | undefined, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch (error) {
    io.stderr(`ifcsheet: cannot read ${file}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
    return FAILED;
  }
  let table: ReturnType<typeof readProjectMaterials> = [];
  if (projectFile !== undefined) {
    try {
      table = readProjectMaterials(await readFile(projectFile, 'utf8'));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      io.stderr(`ifcsheet: ${code === 'ENOENT' ? `cannot read ${projectFile}: no such file` : `${projectFile} cannot be used as a project: ${(error as Error).message}`}\n`);
      return FAILED;
    }
  }
  if (standardId !== undefined && !packForCommandLine(standardId)) {
    io.stderr(unknownStandardMessage(standardId));
    return USAGE;
  }
  table = [...materialsUnder(standardId, table)];
  const opened = await openModel(bytes, { geometry: false });
  const rows = materialReport(opened.dataStore, table);
  io.stdout(json ? `${JSON.stringify({ file, ...(projectFile !== undefined ? { project: projectFile } : {}), ...(standardId !== undefined ? { standard: standardId } : {}), materials: rows }, null, 2)}\n` : materialReportText(rows));
  return OK;
}

/** `ifcsheet materials`: refuses a wrong command line (2), else runs; 1 when the file cannot be read or the run fails. */
export async function materialsCommand(args: MaterialsArgs, io: CliIo): Promise<number> {
  if (args.rest.length !== 1 || args.foreignOption) {
    io.stderr('ifcsheet materials takes one model, --project, --standard and --json only: ifcsheet materials <model.ifc> [--project <file>] [--standard <id>] [--json]\n');
    return USAGE;
  }
  try {
    return await materials(args.rest[0], args.json, args.project, args.standard, io);
  } catch (error) {
    io.stderr(`ifcsheet: materials of ${basename(args.rest[0])} failed: ${(error as Error).message}\n`);
    return FAILED;
  }
}
