/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet list`: a schedule from the Lists engine (#78). The argument checks and the call, as `run` in `cli.ts` had them before the commands became a registry. */

import { basename } from 'node:path';
import { list } from '../cli-list.js';
import { localeProblem } from '../cli-language.js';
import { EXIT, type CliCommand } from '../cli-command.js';

export const listCommand: CliCommand = {
  name: 'list',
  usageRank: 600,
  usage: `  ifcsheet list <model.ifc> --project <file> [--schedule <id>] [--csv | --json] [--locale <ro|en>]`,
  helpRank: 500,
  help: `  list    A schedule built from the Lists engine (the app's Schedule from the model): the elements of the project's list definition by
          class, storey and property, its columns, grouped and summed, with the total. The rows and totals are the Lists panel's, the CSV
          is the app's file. --schedule names which one (its id or name; the only one when the project has one). Text, CSV or JSON.`,
  async run(rest, values, io) {
    const badLocale = localeProblem(values.locale);
    if (badLocale) {
      io.stderr(badLocale);
      return EXIT.usage;
    }
    if (rest.length !== 1 || !values.project || values.out || values.dxf || values.name || values.handover || values.pattern || values.template !== undefined || values.detail || values.system !== undefined || values['include-far-elements'] || (values.csv && values.json)) {
      io.stderr('ifcsheet list takes one model, --project, --schedule, --csv or --json and --locale: ifcsheet list <model.ifc> --project <file> [--schedule <id>] [--csv | --json] [--locale <ro|en>]\n');
      return EXIT.usage;
    }
    try {
      return await list({ model: rest[0], project: values.project, ...(values.schedule !== undefined ? { schedule: values.schedule } : {}), csv: values.csv === true, json: values.json === true, ...(values.locale !== undefined ? { locale: values.locale } : {}) }, io);
    } catch (error) {
      io.stderr(`ifcsheet: list of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  },
};
