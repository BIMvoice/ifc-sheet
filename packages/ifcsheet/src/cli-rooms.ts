/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet rooms model.ifc` (#42): the room and area schedule of a model on
 * the command line, the same rows the app prints on its A-6xx sheet (one rule
 * for the rooms and their areas, `room-areas.ts`).
 */

import { readFile } from 'node:fs/promises';
import { openModel, readRooms, type OpenedModel } from './headless.js';
import { roomSchedule, roomScheduleCsv, roomScheduleLines, roomScheduleText, roomScheduleWords, type RoomSchedule } from './room-schedule.js';
import type { CliIo } from './cli.js';
import type { RoomsRead } from './room-read.js';
import { readProjectFile } from './project-read.js';
import { sheetFormat, type UnitsAndNumbers } from './units-and-numbers.js';

export interface RoomsArgs {
  model: string;
  csv: boolean;
  json: boolean;
  locale: string;
  /** A saved project: its "Units and numbers" setting decides how the text writes a figure (separator, decimals, unit); the CSV and JSON stay plain. */
  project?: string;
}

/** The schedule as a JSON value: plain numbers, each room with where its area comes from, and the rooms the area rule leaves out. */
function scheduleJson(file: string, schedule: RoomSchedule, read: RoomsRead, locale: string) {
  const words = roomScheduleWords(locale);
  return {
    file,
    levels: schedule.levels.map((l) => ({ name: l.name || words.noLevel, total: l.total, rooms: l.rooms.map((r) => ({ number: r.number, name: r.name, area: r.area, perimeter: r.perimeter, source: r.source })) })),
    total: schedule.total,
    rooms: schedule.rooms,
    areaFromGeometry: schedule.fromGeometry,
    withoutArea: schedule.withoutArea,
    leftOut: read.leftOut,
    lines: roomScheduleLines(schedule, words).length,
  };
}

/** Everything `ifcsheet rooms` prints for a model, as values: the one computation of the command and of the MCP tool `ifcsheet_rooms`. */
export interface RoomsOutput {
  schedule: RoomSchedule;
  read: RoomsRead;
  /** What `--json` prints (before it is written as text). */
  json: ReturnType<typeof scheduleJson>;
  /** What `--csv` prints. */
  csv: string;
  /** What the plain run prints: the table in the project's "Units and numbers" format, then the line saying where the areas come from. */
  text: string;
}

/** The room schedule of an opened model; null when it has no rooms (IfcSpace) to list. */
export function roomsOutput(file: string, model: OpenedModel, locale: string, units?: UnitsAndNumbers): RoomsOutput | null {
  const read = readRooms(model.dataStore, model.meshes);
  const schedule = roomSchedule(read.levels, read.rooms);
  if (schedule.rooms === 0) return null;
  const words = roomScheduleWords(locale);
  const summary = `${schedule.rooms} rooms; areas from ${schedule.rooms - schedule.fromGeometry - schedule.withoutArea} ${words.quantity}, ${schedule.fromGeometry} ${words.geometry}${schedule.withoutArea ? `, ${schedule.withoutArea} none` : ''}. Left out: ${read.leftOut.external} external, ${read.leftOut.gfa} area-scheme (GFA), ${read.leftOut.parents} split into rooms of their own.`;
  return {
    schedule, read,
    json: scheduleJson(file, schedule, read, locale),
    csv: roomScheduleCsv(schedule, locale),
    text: `${roomScheduleText(schedule, sheetFormat(locale, units))}\n\n${summary}\n`,
  };
}

/** `ifcsheet rooms`: exit 0 with the schedule, 1 when the file cannot be read or has no rooms. */
export async function rooms(args: RoomsArgs, io: CliIo): Promise<number> {
  let units;
  if (args.project !== undefined) {
    let projectText: string;
    try { projectText = await readFile(args.project, 'utf8'); } catch (error) {
      io.stderr(`ifcsheet: cannot read ${args.project}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return 1;
    }
    try { units = readProjectFile(projectText).unitsAndNumbers; } catch (error) {
      io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`);
      return 1;
    }
  }
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
  const out = roomsOutput(args.model, model, args.locale, units);
  if (!out) {
    io.stderr(`ifcsheet: ${args.model} has no rooms (IfcSpace) to list.\n`);
    return 1;
  }
  if (args.json) io.stdout(`${JSON.stringify(out.json, null, 2)}\n`);
  else if (args.csv) io.stdout(`${out.csv}\n`);
  else io.stdout(out.text);
  return 0;
}
