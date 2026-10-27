/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet rooms model.ifc` (#42): the room and area schedule of a model on
 * the command line, the same rows the app prints on its A-6xx sheet (one rule
 * for the rooms and their areas, `room-areas.ts`).
 */

import { readFile } from 'node:fs/promises';
import { openModel, readRooms } from './headless.js';
import { roomSchedule, roomScheduleCsv, roomScheduleLines, roomScheduleText, roomScheduleWords, type RoomSchedule } from './room-schedule.js';
import type { CliIo } from './cli.js';
import type { RoomsRead } from './room-read.js';
import { readProjectFile } from './project-read.js';
import { sheetFormat } from './units-and-numbers.js';
import { commandLanguage } from './cli-language.js';
import { cliSayFor } from './cli-words.js';

export interface RoomsArgs {
  model: string;
  csv: boolean;
  json: boolean;
  /** `--locale` as given; the project's language, when it records one, comes first (`cli-language.ts`). */
  locale?: string;
  /** A saved project: its "Units and numbers" setting decides how the text writes a figure (separator, decimals, unit); the CSV and JSON stay plain. */
  project?: string;
}

/** The schedule as JSON: plain numbers, each room with where its area comes from, and the rooms the area rule leaves out. */
function scheduleJson(file: string, schedule: RoomSchedule, read: RoomsRead, locale: string): string {
  const words = roomScheduleWords(locale);
  return JSON.stringify({
    file,
    levels: schedule.levels.map((l) => ({ name: l.name || words.noLevel, total: l.total, rooms: l.rooms.map((r) => ({ number: r.number, name: r.name, area: r.area, perimeter: r.perimeter, source: r.source })) })),
    total: schedule.total,
    rooms: schedule.rooms,
    areaFromGeometry: schedule.fromGeometry,
    withoutArea: schedule.withoutArea,
    leftOut: read.leftOut,
    lines: roomScheduleLines(schedule, words).length,
  }, null, 2);
}

/** `ifcsheet rooms`: exit 0 with the schedule, 1 when the file cannot be read or has no rooms. */
export async function rooms(args: RoomsArgs, io: CliIo): Promise<number> {
  let units;
  let projectFacts: ReturnType<typeof readProjectFile> | undefined;
  if (args.project !== undefined) {
    let projectText: string;
    try { projectText = await readFile(args.project, 'utf8'); } catch (error) {
      io.stderr(`ifcsheet: cannot read ${args.project}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return 1;
    }
    try { projectFacts = readProjectFile(projectText); units = projectFacts.unitsAndNumbers; } catch (error) {
      io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`);
      return 1;
    }
  }
  const language = commandLanguage({ ...(projectFacts ? { project: projectFacts } : {}), ...(args.locale !== undefined ? { locale: args.locale } : {}) }, io);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(args.model));
  } catch (error) {
    io.stderr(`ifcsheet: cannot read ${args.model}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
    return 1;
  }
  let model;
  try {
    model = await openModel(bytes);
  } catch (error) {
    // Without geometry a room with no stated area has none: said below.
    io.stderr(`ifcsheet: the geometry could not be read (${(error as Error).message}); rooms the model gives no area are listed without one\n`);
    model = await openModel(bytes, { geometry: false });
  }
  const read = readRooms(model.dataStore, model.meshes);
  const schedule = roomSchedule(read.levels, read.rooms);
  if (schedule.rooms === 0) {
    io.stderr(`ifcsheet: ${args.model} has no rooms (IfcSpace) to list.\n`);
    return 1;
  }
  if (args.json) io.stdout(`${scheduleJson(args.model, schedule, read, language)}\n`);
  else if (args.csv) io.stdout(`${roomScheduleCsv(schedule, language)}\n`);
  else {
    io.stdout(`${roomScheduleText(schedule, sheetFormat(language, units))}\n`);
    const say = cliSayFor(language);
    const none = schedule.withoutArea ? say('rooms.none', { count: schedule.withoutArea }) : '';
    io.stdout(`\n${say('rooms.summary', { rooms: schedule.rooms, fromQuantity: schedule.rooms - schedule.fromGeometry - schedule.withoutArea, fromGeometry: schedule.fromGeometry, none, external: read.leftOut.external, gfa: read.leftOut.gfa, parents: read.leftOut.parents })}\n`);
  }
  return 0;
}
