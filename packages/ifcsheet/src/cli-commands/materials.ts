/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet materials`: the model's materials and how each draws (#90). The argument checks and the call, as `run` in `cli.ts` had them before the commands became a registry. */

import { materialsCommand as materials } from '../cli-materials.js';
import type { CliCommand } from '../cli-command.js';

export const materialsCommand: CliCommand = {
  name: 'materials',
  usageRank: 300,
  usage: `  ifcsheet materials <model.ifc> [--project <file>] [--standard <id>] [--json]`,
  helpRank: 300,
  help: `  materials  The model's materials and how each draws where a view cuts it: hatch, scale,
          fill, hatch pen, membrane. With --project, the project's own table applies (what the
          app's Materials section edits); a material it has no row for is guessed from its name.
          With --standard, that standard's hatch rows (ro, de) are laid over the table first.`,
  async run(rest, values, io) {
    return await materials({ rest, json: values.json === true, project: values.project, standard: values.standard, foreignOption: Boolean(values.out || values.dxf || values.name || values['include-far-elements']) }, io);
  },
};
