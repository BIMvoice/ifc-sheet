/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet check`: the model-readiness report. The argument checks and the call, as `run` in `cli.ts` had them before the commands became a registry. */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { ModelRefusal, openModel, readProjectFile, readinessWithProject, type ProjectFacts } from '../headless.js';
import { describeReadiness } from '../readiness.js';
import { type CliIo } from '../cli-command.js';
import { EXIT, type CliCommand } from '../cli-command.js';

/** `ifcsheet check`: exit 0 when the model lacks nothing the drawings read, 1 when something would weaken them. */
async function check(file: string, json: boolean, projectFile: string | undefined, includeFarElements: boolean, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch (error) {
    io.stderr(`ifcsheet: cannot read ${file}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
    return EXIT.failed;
  }
  let project: ProjectFacts | undefined;
  if (projectFile !== undefined) {
    let projectText: string;
    try {
      projectText = await readFile(projectFile, 'utf8');
    } catch (error) {
      io.stderr(`ifcsheet: cannot read ${projectFile}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return EXIT.failed;
    }
    try {
      project = readProjectFile(projectText);
    } catch (error) {
      io.stderr(`ifcsheet: ${projectFile} cannot be used as a project: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  // The counts read the entity tables; the elements the views are framed without are measured on the meshes, so the geometry is read too (a model with none is still reported on). The project's own setting counts as the flag.
  const include = includeFarElements || project?.includeFarElements === true;
  let opened;
  try {
    opened = await openModel(bytes, { includeFarElements: include });
  } catch (error) {
    if (error instanceof ModelRefusal) throw error;
    io.stderr(`ifcsheet: the geometry could not be read (${(error as Error).message}); the far-away elements are not checked\n`);
    opened = await openModel(bytes, { geometry: false });
  }
  const findings = readinessWithProject(opened, project).map((f) => ({ kind: f.kind, ...describeReadiness(f), params: f.params }));
  if (json) {
    io.stdout(`${JSON.stringify({ file, ...(projectFile !== undefined ? { project: projectFile } : {}), ready: findings.length === 0, findings }, null, 2)}\n`);
  } else if (findings.length === 0) {
    io.stdout(`${file}: the model has what the drawing set reads: storeys, rooms, materials, quantities.\n`);
  } else {
    io.stdout(`${file}: ${findings.length} thing${findings.length === 1 ? '' : 's'} the model lacks\n`);
    for (const f of findings) io.stdout(`\n- ${f.missing}\n  ${f.effect}\n`);
  }
  return findings.length === 0 ? EXIT.ok : EXIT.failed;
}

export const checkCommand: CliCommand = {
  name: 'check',
  usageRank: 200,
  usage: `  ifcsheet check <model.ifc> [--project <file>] [--json] [--include-far-elements]`,
  helpRank: 200,
  help: `  check   The model-readiness report: what the IFC lacks (storeys, rooms, materials,
          quantity sets, unique GlobalIds) and which drawings and schedules are
          weaker for it. Plain English, or JSON with --json. With --project, also what the
          saved project's split schedules get wrong (an element listed in more than one
          part, or in no part) and the title block values its layout cuts short on a sheet.`,
  async run(rest, values, io) {
    if (rest.length !== 1 || values.out || values.dxf || values.name || values.csv || values.detail || values.locale !== undefined || values.handover || values.pattern || values.template !== undefined || values.schedule !== undefined) {
      io.stderr('ifcsheet check takes one model, --project, --json and --include-far-elements only: ifcsheet check <model.ifc> [--project <file>] [--json] [--include-far-elements]\n');
      return EXIT.usage;
    }
    try {
      return await check(rest[0], values.json === true, values.project, values['include-far-elements'] === true, io);
    } catch (error) {
      io.stderr(`ifcsheet: check of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  },
};
