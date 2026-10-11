/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect } from 'vitest';
import { extractScheduleOnDemand, parseIso8601Duration } from '../src/schedule-extractor.js';
import type { IfcDataStore } from '../src/columnar-parser.js';
import type { EntityRef } from '../src/types.js';

/**
 * Minimal in-memory IfcDataStore builder for tests — mirrors the helper used in
 * other on-demand extractor suites. Each `line` is a full STEP statement;
 * byteOffset/byteLength are computed by matching the line in the composed text.
 */
function buildStoreFromStep(
  lines: string[],
  opts?: {
    schemaVersion?: IfcDataStore['schemaVersion'];
    globalIdByExpressId?: Map<number, string>;
  },
): IfcDataStore {
  const text = lines.join('\n');
  const source = new TextEncoder().encode(text);

  const byId = new Map<number, EntityRef>();
  const byType = new Map<string, number[]>();

  let cursor = 0;
  for (const line of lines) {
    const match = line.match(/^#(\d+)\s*=\s*(\w+)\(/);
    if (match) {
      const expressId = parseInt(match[1], 10);
      const type = match[2];
      const idx = text.indexOf(line, cursor);
      const byteOffset = idx >= 0 ? idx : cursor;
      const ref: EntityRef = {
        expressId,
        type,
        byteOffset,
        byteLength: line.length,
        lineNumber: 1,
      };
      byId.set(expressId, ref);
      const typeUpper = type.toUpperCase();
      let list = byType.get(typeUpper);
      if (!list) {
        list = [];
        byType.set(typeUpper, list);
      }
      list.push(expressId);
      cursor = byteOffset + line.length + 1; // +1 for newline
    }
  }

  const gidMap = opts?.globalIdByExpressId ?? new Map<number, string>();
  const entities = {
    getGlobalId: (id: number) => gidMap.get(id) ?? '',
    getName: (id: number) => `entity${id}`,
  };

  return {
    source,
    schemaVersion: opts?.schemaVersion ?? 'IFC4',
    entityIndex: { byId, byType },
    entities,
  } as unknown as IfcDataStore;
}

describe('parseIso8601Duration', () => {
  it('parses days', () => {
    expect(parseIso8601Duration('P1D')).toBe(86400);
    expect(parseIso8601Duration('P2D')).toBe(2 * 86400);
  });

  it('parses hours/minutes/seconds', () => {
    expect(parseIso8601Duration('PT1H')).toBe(3600);
    expect(parseIso8601Duration('PT1H30M')).toBe(3600 + 30 * 60);
    expect(parseIso8601Duration('PT45S')).toBe(45);
  });

  it('parses weeks', () => {
    expect(parseIso8601Duration('P2W')).toBe(14 * 86400);
  });

  it('returns undefined on invalid', () => {
    expect(parseIso8601Duration('not a duration')).toBeUndefined();
    expect(parseIso8601Duration('')).toBeUndefined();
    expect(parseIso8601Duration(undefined)).toBeUndefined();
  });

  it('parses the ISO 8601-2 signed extension into negative seconds', () => {
    // PR #1963 maintainer ruling: a lead time (negative lag) is emitted as
    // a signed duration on export, so the decoder has to accept the
    // leading "-" it previously rejected.
    expect(parseIso8601Duration('-P2D')).toBe(-2 * 86400);
    expect(parseIso8601Duration('-PT1H30M')).toBe(-(3600 + 30 * 60));
  });

  it('rejects a bare "-P" / "-PT" the same way it rejects bare "P" / "PT"', () => {
    // A sign with no components would otherwise silently return -0.
    expect(parseIso8601Duration('P')).toBeUndefined();
    expect(parseIso8601Duration('PT')).toBeUndefined();
    expect(parseIso8601Duration('-P')).toBeUndefined();
    expect(parseIso8601Duration('-PT')).toBeUndefined();
  });
});

describe('extractScheduleOnDemand', () => {
  it('returns empty extraction with hasSchedule=false when no tasks', () => {
    const store = buildStoreFromStep(["#1=IFCWALL('wall-gid',$,'W',$,$,$,$,$,$);"]);
    const result = extractScheduleOnDemand(store);
    expect(result.hasSchedule).toBe(false);
    expect(result.tasks).toEqual([]);
    expect(result.workSchedules).toEqual([]);
    expect(result.sequences).toEqual([]);
  });

  it('extracts IfcTask with TaskTime (IFC4 layout)', () => {
    // IfcTaskTime: [Name, DataOrigin, UserDefinedDataOrigin, DurationType,
    //   ScheduleDuration, ScheduleStart, ScheduleFinish, ...]
    // IfcTask (IFC4):
    //   [GlobalId, OwnerHistory, Name, Description, ObjectType, Identification,
    //    LongDescription, Status, WorkMethod, IsMilestone, Priority, TaskTime,
    //    PredefinedType]
    const lines = [
      "#10=IFCTASKTIME($,$,$,.WORKTIME.,'P5D','2024-01-01T08:00:00','2024-01-06T17:00:00',$,$,$,$,$,$,.F.,$,$,$,$,$,$);",
      "#20=IFCTASK('task-1-gid',$,'Install walls','desc','constr','T1','Full install','NotStarted','Manual',.F.,$,#10,.CONSTRUCTION.);",
    ];
    const store = buildStoreFromStep(lines);
    const result = extractScheduleOnDemand(store);
    expect(result.hasSchedule).toBe(true);
    expect(result.tasks).toHaveLength(1);
    const t = result.tasks[0];
    expect(t.globalId).toBe('task-1-gid');
    expect(t.name).toBe('Install walls');
    expect(t.identification).toBe('T1');
    expect(t.predefinedType).toBe('CONSTRUCTION');
    expect(t.isMilestone).toBe(false);
    expect(t.taskTime?.scheduleStart).toBe('2024-01-01T08:00:00');
    expect(t.taskTime?.scheduleFinish).toBe('2024-01-06T17:00:00');
    expect(t.taskTime?.scheduleDuration).toBe('P5D');
    expect(t.taskTime?.durationType).toBe('WORKTIME');
    expect(t.taskTime?.isCritical).toBe(false);
  });

  it('links assigned products via IfcRelAssignsToProcess', () => {
    const lines = [
      "#1=IFCWALL('wall-A-gid',$,'Wall A',$,$,$,$,$,$);",
      "#2=IFCWALL('wall-B-gid',$,'Wall B',$,$,$,$,$,$);",
      "#10=IFCTASKTIME($,$,$,.WORKTIME.,'P2D','2024-01-01T00:00:00','2024-01-03T00:00:00',$,$,$,$,$,$,$,$,$,$,$,$,$);",
      "#20=IFCTASK('task-gid',$,'Install',$,$,$,$,$,$,.F.,$,#10,.CONSTRUCTION.);",
      "#30=IFCRELASSIGNSTOPROCESS('rel-gid',$,$,$,(#1,#2),$,#20,$);",
    ];
    const store = buildStoreFromStep(lines, {
      globalIdByExpressId: new Map([[1, 'wall-A-gid'], [2, 'wall-B-gid']]),
    });
    const result = extractScheduleOnDemand(store);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].productExpressIds).toEqual([1, 2]);
    expect(result.tasks[0].productGlobalIds).toEqual(['wall-A-gid', 'wall-B-gid']);
  });

  it('builds parent/child hierarchy via IfcRelNests', () => {
    const lines = [
      "#10=IFCTASK('root-gid',$,'Project',$,$,$,$,$,$,.F.,$,$,$);",
      "#11=IFCTASK('child-a-gid',$,'Foundation',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#12=IFCTASK('child-b-gid',$,'Framing',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#20=IFCRELNESTS('rel-gid',$,$,$,#10,(#11,#12));",
    ];
    const store = buildStoreFromStep(lines);
    const result = extractScheduleOnDemand(store);
    const root = result.tasks.find(t => t.globalId === 'root-gid');
    const a = result.tasks.find(t => t.globalId === 'child-a-gid');
    const b = result.tasks.find(t => t.globalId === 'child-b-gid');
    expect(root?.childGlobalIds).toEqual(['child-a-gid', 'child-b-gid']);
    expect(a?.parentGlobalId).toBe('root-gid');
    expect(b?.parentGlobalId).toBe('root-gid');
  });

  it('dedupes when two IfcRelNests entities nest the same task/subtask pair', () => {
    // Two distinct IFCRELNESTS entities (#20 and #21) both nest root (#10)
    // over child-a (#11) — reached via two independent relation entities,
    // not two identical iterations of the same one.
    const lines = [
      "#10=IFCTASK('root-gid',$,'Project',$,$,$,$,$,$,.F.,$,$,$);",
      "#11=IFCTASK('child-a-gid',$,'Foundation',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#20=IFCRELNESTS('rel-gid',$,$,$,#10,(#11));",
      "#21=IFCRELNESTS('rel-gid-2',$,$,$,#10,(#11));",
    ];
    const store = buildStoreFromStep(lines);
    const result = extractScheduleOnDemand(store);
    const root = result.tasks.find(t => t.globalId === 'root-gid');
    // A duplicated relation must not duplicate the edge.
    expect(root?.childGlobalIds).toEqual(['child-a-gid']);
  });

  it('extracts IfcRelSequence dependencies with lag time', () => {
    const lines = [
      "#10=IFCTASK('pred-gid',$,'Predecessor',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#11=IFCTASK('succ-gid',$,'Successor',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#12=IFCLAGTIME($,$,$,IFCDURATION('P2D'),.WORKTIME.);",
      "#20=IFCRELSEQUENCE('seq-gid',$,$,$,#10,#11,#12,.FINISH_START.,$);",
    ];
    const store = buildStoreFromStep(lines);
    const result = extractScheduleOnDemand(store);
    expect(result.sequences).toHaveLength(1);
    expect(result.sequences[0].relatingTaskGlobalId).toBe('pred-gid');
    expect(result.sequences[0].relatedTaskGlobalId).toBe('succ-gid');
    expect(result.sequences[0].sequenceType).toBe('FINISH_START');
    expect(result.sequences[0].timeLagSeconds).toBe(2 * 86400);
    expect(result.sequences[0].timeLagDuration).toBe('P2D');
  });

  it('associates tasks with a work schedule via IfcRelAssignsToControl', () => {
    const lines = [
      "#10=IFCTASK('task-a-gid',$,'Task A',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#11=IFCTASK('task-b-gid',$,'Task B',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#30=IFCWORKSCHEDULE('sched-gid',$,'Main schedule','desc','Planning','S1','2024-01-01T00:00:00',$,'Construction',$,$,'2024-01-01T00:00:00','2024-06-01T00:00:00',.PLANNED.);",
      "#40=IFCRELASSIGNSTOCONTROL('rel-gid',$,$,$,(#10,#11),$,#30);",
    ];
    const store = buildStoreFromStep(lines);
    const result = extractScheduleOnDemand(store);
    expect(result.workSchedules).toHaveLength(1);
    expect(result.workSchedules[0].globalId).toBe('sched-gid');
    expect(result.workSchedules[0].name).toBe('Main schedule');
    expect(result.workSchedules[0].predefinedType).toBe('PLANNED');
    expect(result.workSchedules[0].taskGlobalIds).toEqual(['task-a-gid', 'task-b-gid']);
    const t = result.tasks.find(x => x.globalId === 'task-a-gid');
    expect(t?.controllingScheduleGlobalIds).toEqual(['sched-gid']);
  });

  it('dedupes when two IfcRelAssignsToControl entities assign the same task to the same schedule', () => {
    // Two distinct IFCRELASSIGNSTOCONTROL entities (#40 and #41) both assign
    // task-a (#10) to schedule (#30) — reached via two independent relation
    // entities, not two identical iterations of the same one. The paired
    // arrays (schedule.taskGlobalIds / task.controllingScheduleGlobalIds)
    // must stay in lockstep: both dedupe, or neither would.
    const lines = [
      "#10=IFCTASK('task-a-gid',$,'Task A',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#30=IFCWORKSCHEDULE('sched-gid',$,'Main schedule','desc','Planning','S1','2024-01-01T00:00:00',$,'Construction',$,$,'2024-01-01T00:00:00','2024-06-01T00:00:00',.PLANNED.);",
      "#40=IFCRELASSIGNSTOCONTROL('rel-gid',$,$,$,(#10),$,#30);",
      "#41=IFCRELASSIGNSTOCONTROL('rel-gid-2',$,$,$,(#10),$,#30);",
    ];
    const store = buildStoreFromStep(lines);
    const result = extractScheduleOnDemand(store);
    expect(result.workSchedules[0].taskGlobalIds).toEqual(['task-a-gid']);
    const t = result.tasks.find(x => x.globalId === 'task-a-gid');
    expect(t?.controllingScheduleGlobalIds).toEqual(['sched-gid']);
  });
});

describe('extractScheduleOnDemand — IfcWorkCalendar (#4830)', () => {
  // IfcWorkCalendar attribute order (IFC4/IFC4X3, IfcControl supertype):
  // [0] GlobalId [1] OwnerHistory [2] Name [3] Description [4] ObjectType
  // [5] Identification [6] WorkingTimes [7] ExceptionTimes [8] PredefinedType
  // IfcWorkTime (IfcSchedulingTime supertype, so no GlobalId):
  // [0] Name [1] DataOrigin [2] UserDefinedDataOrigin
  // [3] RecurrencePattern [4] Start [5] Finish
  // IfcRecurrencePattern:
  // [0] RecurrenceType [1] DayComponent [2] WeekdayComponent
  // [3] MonthComponent [4] Position [5] Interval [6] Occurrences [7] TimePeriods

  it('extracts a bare IfcWorkCalendar with a WorkingTime carrying a RecurrencePattern', () => {
    const lines = [
      "#60=IFCTIMEPERIOD('07:00:00','16:00:00');",
      "#61=IFCRECURRENCEPATTERN(.WEEKLY.,$,(1,2,3,4,5),$,$,1,30,(#60));",
      "#62=IFCWORKTIME('Weekdays',.USERDEFINED.,'hand-entered',#61,'2024-05-01','2024-12-31');",
      "#63=IFCWORKTIME('Shutdown',$,$,$,'2024-08-01','2024-08-14');",
      "#64=IFCWORKCALENDAR('cal-gid',$,'Site calendar','Two shifts','ObjType','CAL-1',(#62),(#63),.SECONDSHIFT.);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));

    // A calendar-only file still counts as 4D data worth surfacing.
    expect(result.hasSchedule).toBe(true);
    expect(result.workCalendars).toHaveLength(1);

    const cal = result.workCalendars![0];
    expect(cal.expressId).toBe(64);
    expect(cal.globalId).toBe('cal-gid');
    expect(cal.name).toBe('Site calendar');
    expect(cal.description).toBe('Two shifts');
    expect(cal.objectType).toBe('ObjType');
    expect(cal.identification).toBe('CAL-1');
    expect(cal.predefinedType).toBe('SECONDSHIFT');

    expect(cal.workingTimes).toHaveLength(1);
    const working = cal.workingTimes[0];
    expect(working.name).toBe('Weekdays');
    expect(working.dataOrigin).toBe('USERDEFINED');
    expect(working.userDefinedDataOrigin).toBe('hand-entered');
    expect(working.start).toBe('2024-05-01');
    expect(working.finish).toBe('2024-12-31');

    const pattern = working.recurrencePattern!;
    expect(pattern.recurrenceType).toBe('WEEKLY');
    expect(pattern.weekdayComponent).toEqual([1, 2, 3, 4, 5]);
    // `$` aggregates read back as empty arrays, not undefined.
    expect(pattern.dayComponent).toEqual([]);
    expect(pattern.monthComponent).toEqual([]);
    expect(pattern.position).toBeUndefined();
    expect(pattern.interval).toBe(1);
    expect(pattern.occurrences).toBe(30);
    expect(pattern.timePeriods).toEqual([{ start: '07:00:00', end: '16:00:00' }]);

    // The exception time has `$` for RecurrencePattern — absent, not empty.
    expect(cal.exceptionTimes).toHaveLength(1);
    expect(cal.exceptionTimes[0].name).toBe('Shutdown');
    expect(cal.exceptionTimes[0].recurrencePattern).toBeUndefined();
  });

  it('reads a calendar whose WorkingTimes / ExceptionTimes are both absent', () => {
    const lines = [
      "#64=IFCWORKCALENDAR('empty-cal',$,'Empty',$,$,$,$,$,.NOTDEFINED.);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));
    expect(result.workCalendars).toHaveLength(1);
    expect(result.workCalendars![0].workingTimes).toEqual([]);
    expect(result.workCalendars![0].exceptionTimes).toEqual([]);
    expect(result.workCalendars![0].predefinedType).toBe('NOTDEFINED');
  });

  it('populates both the schedule-control and the calendar field when a task has each', () => {
    // Two SEPARATE IfcRelAssignsToControl relations on the same task: #40
    // binds it to the work schedule, #41 to the work calendar. Neither may
    // clobber the other's field.
    const lines = [
      "#10=IFCTASK('task-a-gid',$,'Task A',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#11=IFCTASK('task-b-gid',$,'Task B',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#30=IFCWORKSCHEDULE('sched-gid',$,'Main schedule',$,$,$,'2024-01-01T00:00:00',$,$,$,$,'2024-01-01T00:00:00','2024-06-01T00:00:00',.PLANNED.);",
      "#64=IFCWORKCALENDAR('cal-gid',$,'Site calendar',$,$,$,$,$,.FIRSTSHIFT.);",
      "#40=IFCRELASSIGNSTOCONTROL('rel-sched',$,$,$,(#10,#11),$,#30);",
      "#41=IFCRELASSIGNSTOCONTROL('rel-cal',$,$,$,(#10,#30),$,#64);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));

    const taskA = result.tasks.find(t => t.globalId === 'task-a-gid')!;
    expect(taskA.controllingScheduleGlobalIds).toEqual(['sched-gid']);
    expect(taskA.calendarGlobalIds).toEqual(['cal-gid']);

    // Task B is under the schedule but was never given a calendar.
    const taskB = result.tasks.find(t => t.globalId === 'task-b-gid')!;
    expect(taskB.controllingScheduleGlobalIds).toEqual(['sched-gid']);
    expect(taskB.calendarGlobalIds ?? []).toEqual([]);

    // The calendar relation also names the schedule itself.
    const schedule = result.workSchedules[0];
    expect(schedule.calendarGlobalIds).toEqual(['cal-gid']);
    // …and the schedule's own task list is untouched by it.
    expect(schedule.taskGlobalIds).toEqual(['task-a-gid', 'task-b-gid']);
  });

  it('dedupes a calendar assigned twice through two separate relations', () => {
    const lines = [
      "#10=IFCTASK('task-a-gid',$,'Task A',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#64=IFCWORKCALENDAR('cal-gid',$,'Site calendar',$,$,$,$,$,.FIRSTSHIFT.);",
      "#41=IFCRELASSIGNSTOCONTROL('rel-cal',$,$,$,(#10),$,#64);",
      "#42=IFCRELASSIGNSTOCONTROL('rel-cal-2',$,$,$,(#10),$,#64);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));
    expect(result.tasks[0].calendarGlobalIds).toEqual(['cal-gid']);
  });

  it('records two distinct calendars assigned to one task', () => {
    const lines = [
      "#10=IFCTASK('task-a-gid',$,'Task A',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#64=IFCWORKCALENDAR('cal-base',$,'Base',$,$,$,$,$,.FIRSTSHIFT.);",
      "#65=IFCWORKCALENDAR('cal-site',$,'Site exceptions',$,$,$,$,$,.USERDEFINED.);",
      "#41=IFCRELASSIGNSTOCONTROL('rel-1',$,$,$,(#10),$,#64);",
      "#42=IFCRELASSIGNSTOCONTROL('rel-2',$,$,$,(#10),$,#65);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));
    expect(result.workCalendars!.map(c => c.globalId)).toEqual(['cal-base', 'cal-site']);
    expect(result.tasks[0].calendarGlobalIds).toEqual(['cal-base', 'cal-site']);
  });

  it('gives calendars with missing GlobalIds stable distinct assignment identities', () => {
    const lines = [
      "#10=IFCTASK('task-a-gid',$,'Task A',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
      "#64=IFCWORKCALENDAR($,$,'Same name',$,$,$,$,$,.FIRSTSHIFT.);",
      "#65=IFCWORKCALENDAR($,$,'Same name',$,$,$,$,$,.FIRSTSHIFT.);",
      "#41=IFCRELASSIGNSTOCONTROL('rel-1',$,$,$,(#10),$,#64);",
      "#42=IFCRELASSIGNSTOCONTROL('rel-2',$,$,$,(#10),$,#65);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));
    const ids = result.workCalendars!.map(c => c.globalId);
    expect(new Set(ids).size).toBe(2);
    expect(result.tasks[0].calendarGlobalIds).toEqual(ids);
  });

  it('tolerates malformed scalar recurrence aggregates', () => {
    const lines = [
      '#61=IFCRECURRENCEPATTERN(.WEEKLY.,1,2,3,$,1,$,$);',
      "#62=IFCWORKTIME('Malformed',$,$,#61,$,$);",
      "#64=IFCWORKCALENDAR('cal-gid',$,'Calendar',$,$,$,(#62),$,.FIRSTSHIFT.);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));
    const pattern = result.workCalendars![0].workingTimes[0].recurrencePattern!;
    expect(pattern.dayComponent).toEqual([]);
    expect(pattern.weekdayComponent).toEqual([]);
    expect(pattern.monthComponent).toEqual([]);
  });

  it('does not decode IFC4 calendar attributes in an IFC2X3 model', () => {
    const lines = [
      "#64=IFCWORKCALENDAR('cal-gid',$,'Wrong layout',$,$,$,$,$,.FIRSTSHIFT.);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines, { schemaVersion: 'IFC2X3' }));
    expect(result.workCalendars).toEqual([]);
  });

  it('reports an empty workCalendars array for a schedule with no calendars', () => {
    const lines = [
      "#10=IFCTASK('task-a-gid',$,'Task A',$,$,$,$,$,$,.F.,$,$,.CONSTRUCTION.);",
    ];
    const result = extractScheduleOnDemand(buildStoreFromStep(lines));
    expect(result.workCalendars).toEqual([]);
    expect(result.tasks[0].calendarGlobalIds ?? []).toEqual([]);
  });
});
