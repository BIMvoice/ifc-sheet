/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet rooms`: the room and area schedule (#42). The argument checks and the call, as `run` in `cli.ts` had them before the commands became a registry. */

import { basename } from 'node:path';
import { rooms } from '../cli-rooms.js';
import { EXIT, type CliCommand } from '../cli-command.js';

export const roomsCommand: CliCommand = {
  name: 'rooms',
  usageRank: 500,
  usage: `  ifcsheet rooms <model.ifc> [--csv | --json] [--locale <ro|en>]`,
  helpRank: 700,
  help: `  rooms   The room and area schedule: every room (IfcSpace) by level with its number, name and
          area, a total per level and for the building (the urban indicators' Au). An area is the
          model's NetFloorArea (else GrossFloorArea), else the footprint of the room's geometry;
          the last lines say which. Text, or CSV with --csv, or JSON with --json.`,
  async run(rest, values, io) {
    if (rest.length !== 1 || values.out || values.dxf || values.name || values.project || values.handover || values.pattern || values.template !== undefined || values.detail || values.schedule !== undefined || values['include-far-elements'] || (values.csv && values.json)) {
      io.stderr('ifcsheet rooms takes one model and --csv or --json and --locale only: ifcsheet rooms <model.ifc> [--csv | --json] [--locale <ro|en>]\n');
      return EXIT.usage;
    }
    try {
      return await rooms({ model: rest[0], csv: values.csv === true, json: values.json === true, locale: values.locale ?? 'en' }, io);
    } catch (error) {
      io.stderr(`ifcsheet: rooms of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  },
};
