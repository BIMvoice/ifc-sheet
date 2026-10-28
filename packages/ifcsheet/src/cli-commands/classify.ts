/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet classify`: the model's types with their classification code (#89). The argument checks and the call, as `run` in `cli.ts` had them before the commands became a registry. */

import { basename } from 'node:path';
import { classify } from '../cli-classify.js';
import { EXIT, type CliCommand } from '../cli-command.js';

export const classifyCommand: CliCommand = {
  name: 'classify',
  usageRank: 700,
  usage: `  ifcsheet classify <model.ifc> --project <file> [--system <name>] [--csv | --json]`,
  helpRank: 600,
  help: `  classify  The model's types with their classification code: the model's own IfcClassificationReference first, else the
          project's mapping (a type, a material or a class to the office's code). --system picks one of the project's
          systems (default: the first). Text, CSV with --csv, JSON with --json.`,
  async run(rest, values, io) {
    if (rest.length !== 1 || !values.project || values.out || values.dxf || values.name || values['include-far-elements'] || values.detail || values.locale !== undefined || values.handover || values.pattern || values.template !== undefined || values.schedule !== undefined || (values.csv && values.json)) {
      io.stderr('ifcsheet classify takes one model, --project, --system and --csv or --json only: ifcsheet classify <model.ifc> --project <file> [--system <name>] [--csv | --json]\n');
      return EXIT.usage;
    }
    try {
      return await classify({ model: rest[0], project: values.project, ...(values.system !== undefined ? { system: values.system } : {}), csv: values.csv === true, json: values.json === true }, io);
    } catch (error) {
      io.stderr(`ifcsheet: classify of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  },
};
