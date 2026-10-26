/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Every `ifcsheet` command, one line each, sorted by name. A new command is a
 * file in this folder and one line here; `run` and the help text read this list
 * and are not edited. Two PRs that each add a command add lines in different
 * places.
 */

import type { CliCommand } from '../cli-command.js';
import { boqCommand } from './boq.js';
import { buildCommand } from './build.js';
import { checkCommand } from './check.js';
import { classifyCommand } from './classify.js';
import { listCommand } from './list.js';
import { materialsCommand } from './materials.js';
import { roomsCommand } from './rooms.js';

export const CLI_COMMANDS: readonly CliCommand[] = [
  boqCommand,
  buildCommand,
  checkCommand,
  classifyCommand,
  listCommand,
  materialsCommand,
  roomsCommand,
];
