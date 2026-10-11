/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * STEP-line builders for the calendar half of `schedule-serializer.ts` —
 * IfcWorkCalendar and the IfcWorkTime / IfcRecurrencePattern / IfcTimePeriod
 * entities its WorkingTimes/ExceptionTimes lists reference. Sibling of
 * `schedule-serializer-builders.ts` (tasks/schedules), split the same way
 * the read side splits `schedule-calendar-types.ts` from
 * `schedule-types.ts`: one concern per file, and both stay under the
 * ~400-line module-size guideline.
 *
 * IfcWorkCalendar does NOT share `buildWorkControl`'s line shape despite
 * both extending IfcControl — IfcWorkSchedule/IfcWorkPlan go through
 * IfcWorkControl (CreationDate..FinishTime), IfcWorkCalendar does not, so
 * everything from attribute index 6 on differs and a shared builder would
 * be a branch on entity type wrapping two disjoint tails.
 */

import type { WorkCalendarInfo, WorkTimeInfo, RecurrencePatternInfo } from './schedule-calendar-types.js';
import { escStr, optStr, optEnum, ensureGlobalId, refList } from './schedule-serializer-builders.js';

/** An IfcWorkTime line plus the ids of the nested entities emitted for it. */
export interface BuiltWorkTime {
  lines: string[];
  /** Express id of the emitted IFCWORKTIME. */
  workTimeId: number;
  /** First free express id after everything this call emitted. */
  nextId: number;
  /** How many IFCRECURRENCEPATTERN entities were emitted (0 or 1). */
  recurrencePatterns: number;
  /** How many IFCTIMEPERIOD entities were emitted. */
  timePeriods: number;
}

function buildTimePeriod(id: number, start: string, end: string): string {
  // IFC4: StartTime, EndTime (both IfcTime).
  return `#${id}=IFCTIMEPERIOD('${escStr(start)}','${escStr(end)}');`;
}

/** Integer list attribute (`DayComponent` et al.) — `$` when empty, matching `refList`'s convention for an absent optional aggregate. */
function intList(values: number[]): string {
  return values.length === 0 ? '$' : `(${values.map(v => Math.trunc(v)).join(',')})`;
}

function optInt(v: number | undefined): string {
  return v === undefined || !Number.isFinite(v) ? '$' : String(Math.trunc(v));
}

/**
 * Emit an IfcRecurrencePattern and any IfcTimePeriod entities it references.
 * The nested entities are emitted first only for human readability — STEP
 * itself allows forward `#N` references, and the rest of this serializer
 * already relies on that ordering convention (`buildTaskTime` is emitted
 * before its owning task for the same reason).
 */
function buildRecurrencePattern(
  startId: number,
  pattern: RecurrencePatternInfo,
): { lines: string[]; patternId: number; nextId: number; timePeriods: number } {
  let nextId = startId;
  const lines: string[] = [];
  const timePeriodIds: number[] = [];
  for (const tp of pattern.timePeriods) {
    const id = nextId++;
    lines.push(buildTimePeriod(id, tp.start, tp.end));
    timePeriodIds.push(id);
  }
  const patternId = nextId++;
  // IFC4: RecurrenceType, DayComponent, WeekdayComponent, MonthComponent,
  //       Position, Interval, Occurrences, TimePeriods
  lines.push([
    `#${patternId}=IFCRECURRENCEPATTERN(`,
    `${optEnum(pattern.recurrenceType)},`,
    `${intList(pattern.dayComponent)},`,
    `${intList(pattern.weekdayComponent)},`,
    `${intList(pattern.monthComponent)},`,
    `${optInt(pattern.position)},`,
    `${optInt(pattern.interval)},`,
    `${optInt(pattern.occurrences)},`,
    `${refList(timePeriodIds)});`,
  ].join(''));
  return { lines, patternId, nextId, timePeriods: timePeriodIds.length };
}

/**
 * Emit one IfcWorkTime, preceded by its IfcRecurrencePattern (and that
 * pattern's IfcTimePeriod entities) when the record carries one. A
 * WorkTimeInfo with no `recurrencePattern` emits `$` for that attribute and
 * no extra entities.
 */
export function buildWorkTime(startId: number, wt: WorkTimeInfo): BuiltWorkTime {
  let nextId = startId;
  const lines: string[] = [];
  let recurrenceRef = '$';
  let recurrencePatterns = 0;
  let timePeriods = 0;
  if (wt.recurrencePattern) {
    const built = buildRecurrencePattern(nextId, wt.recurrencePattern);
    lines.push(...built.lines);
    nextId = built.nextId;
    recurrenceRef = `#${built.patternId}`;
    recurrencePatterns = 1;
    timePeriods = built.timePeriods;
  }
  const workTimeId = nextId++;
  // IFC4 IfcWorkTime (IfcSchedulingTime: Name, DataOrigin,
  // UserDefinedDataOrigin) + RecurrencePattern, Start, Finish.
  lines.push([
    `#${workTimeId}=IFCWORKTIME(`,
    `${optStr(wt.name)},`,
    `${optEnum(wt.dataOrigin)},`,
    `${optStr(wt.userDefinedDataOrigin)},`,
    `${recurrenceRef},`,
    `${optStr(wt.start)},`,
    `${optStr(wt.finish)});`,
  ].join(''));
  return { lines, workTimeId, nextId, recurrencePatterns, timePeriods };
}

export interface BuiltWorkCalendar {
  lines: string[];
  calendarId: number;
  nextId: number;
  workTimes: number;
  recurrencePatterns: number;
  timePeriods: number;
}

/**
 * Emit an IfcWorkCalendar and every IfcWorkTime (plus nested
 * IfcRecurrencePattern / IfcTimePeriod) in its WorkingTimes and
 * ExceptionTimes lists.
 */
export function buildWorkCalendar(
  startId: number,
  cal: WorkCalendarInfo,
  owner: string,
): BuiltWorkCalendar {
  let nextId = startId;
  const lines: string[] = [];
  let workTimes = 0;
  let recurrencePatterns = 0;
  let timePeriods = 0;

  const emitTimes = (times: WorkTimeInfo[]): number[] => {
    const ids: number[] = [];
    for (const wt of times) {
      const built = buildWorkTime(nextId, wt);
      lines.push(...built.lines);
      nextId = built.nextId;
      ids.push(built.workTimeId);
      workTimes += 1;
      recurrencePatterns += built.recurrencePatterns;
      timePeriods += built.timePeriods;
    }
    return ids;
  };

  const workingIds = emitTimes(cal.workingTimes);
  const exceptionIds = emitTimes(cal.exceptionTimes);

  const calendarId = nextId++;
  const globalId = ensureGlobalId(cal.globalId, `calendar|${cal.name}`);
  // IFC4: GlobalId, OwnerHistory, Name, Description, ObjectType,
  //       Identification, WorkingTimes, ExceptionTimes, PredefinedType
  lines.push([
    `#${calendarId}=IFCWORKCALENDAR(`,
    `'${globalId}',`,
    `${owner},`,
    `${optStr(cal.name)},`,
    `${optStr(cal.description)},`,
    `${optStr(cal.objectType)},`,
    `${optStr(cal.identification)},`,
    `${refList(workingIds)},`,
    `${refList(exceptionIds)},`,
    `${optEnum(cal.predefinedType)});`,
  ].join(''));

  return { lines, calendarId, nextId, workTimes, recurrencePatterns, timePeriods };
}
