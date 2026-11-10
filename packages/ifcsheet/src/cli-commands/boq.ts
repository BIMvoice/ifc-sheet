/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet boq`: the bill of quantities (#75). The argument checks and the call, as `run` in `cli.ts` had them before the commands became a registry. */

import { basename } from 'node:path';
import { boq } from '../cli-boq.js';
import { localeProblem } from '../cli-language.js';
import { EXIT, type CliCommand } from '../cli-command.js';

export const boqCommand: CliCommand = {
  name: 'boq',
  usageRank: 400,
  usage: `  ifcsheet boq <model.ifc> --project <file> [--csv | --json] [--detail] [--locale <ro|en>]`,
  helpRank: 400,
  help: `  boq     The bill of quantities (antemasuratoare): the articles of the project file, each with its total
          in its own unit, from the quantities the model declares (never zero for a missing one: the elements
          that lack it are named). Text, CSV with --csv, JSON with --json; --detail adds a row per type.`,
  async run(rest, values, io) {
    const badLocale = localeProblem(values.locale);
    if (badLocale) {
      io.stderr(badLocale);
      return EXIT.usage;
    }
    if (rest.length !== 1 || !values.project || values.out || values.dxf || values.name || values.schedule !== undefined || values['include-far-elements'] || (values.csv && values.json)) {
      io.stderr('ifcsheet boq takes one model, --project, --csv or --json, --detail and --locale: ifcsheet boq <model.ifc> --project <file> [--csv | --json] [--detail] [--locale <ro|en>]\n');
      return EXIT.usage;
    }
    try {
      return await boq({ model: rest[0], project: values.project, csv: values.csv === true, json: values.json === true, detail: values.detail === true, ...(values.locale !== undefined ? { locale: values.locale } : {}) }, io);
    } catch (error) {
      io.stderr(`ifcsheet: boq of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  },
};
