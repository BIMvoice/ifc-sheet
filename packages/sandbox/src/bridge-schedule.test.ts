/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { __schedule_schema_testing as S } from './bridge-schedule.js';

describe('bridge-schedule — internal → public translation', () => {
  it('translateTask maps every camelCase source attribute to its IFC-PascalCase key', () => {
    // Full-shape assertion: covers every task field declared in the schema
    // plus the nested TaskTime sub-struct. Locks down the key rename
    // contract that bim.schedule.* callers depend on.
    const internal = {
      globalId: 'g-1', expressId: 42, name: 'Erect wall',
      description: 'desc', objectType: 'ot', identification: 'id-1',
      longDescription: 'long', status: 'active', workMethod: 'manual',
      isMilestone: false, priority: 5, predefinedType: 'CONSTRUCTION',
      parentGlobalId: 'parent-1',
      childGlobalIds: ['c-1', 'c-2'],
      productExpressIds: [101, 102], productGlobalIds: ['pg-1'],
      controllingScheduleGlobalIds: ['cs-1'],
      calendarGlobalIds: ['cal-1'],
      taskTime: {
        scheduleStart: '2024-05-01T08:00:00', scheduleFinish: '2024-05-03T17:00:00',
        isCritical: true,
      },
    };
    const out = S.translateTask(internal);
    // Identity + navigation.
    expect(out.GlobalId).toBe('g-1');
    expect(out.ExpressId).toBe(42);
    expect(out.Name).toBe('Erect wall');
    expect(out.ParentTaskGlobalId).toBe('parent-1');
    expect(out.ChildTaskGlobalIds).toEqual(['c-1', 'c-2']);
    // "Assigned" prefix on products — IFC-correct, not the internal "product".
    expect(out.AssignedProductExpressIds).toEqual([101, 102]);
    expect(out.AssignedProductGlobalIds).toEqual(['pg-1']);
    expect(out.ControllingScheduleGlobalIds).toEqual(['cs-1']);
    expect(out.CalendarGlobalIds).toEqual(['cal-1']);
    // Nested TaskTime — sub-struct key rename flows through.
    const tt = out.TaskTime as { ScheduleStart: string; IsCritical: boolean };
    expect(tt.ScheduleStart).toBe('2024-05-01T08:00:00');
    expect(tt.IsCritical).toBe(true);
  });

  it('translateSequence uses RelatingProcess / RelatedProcess — IFC EXPRESS naming', () => {
    // Deliberate: internal struct says relatingTaskGlobalId / relatedTaskGlobalId
    // (camelCase + "Task" because that's what it references); IFC EXPRESS
    // names the IfcRelSequence attrs RelatingProcess / RelatedProcess. The
    // public API follows IFC.
    const out = S.translateSequence({
      relatingTaskGlobalId: 'a', relatedTaskGlobalId: 'b',
      sequenceType: 'FINISH_START', timeLagSeconds: 86400,
    });
    expect(out.RelatingProcessGlobalId).toBe('a');
    expect(out.RelatedProcessGlobalId).toBe('b');
    expect(out.SequenceType).toBe('FINISH_START');
    expect(out.TimeLagSeconds).toBe(86400);
  });
});

describe('bridge-schedule — schema hygiene', () => {
  it('no duplicate keys across any struct (catches copy-paste errors in the schema table)', () => {
    // Lint-like: adding a field by duplicating a row is easy and silently
    // corrupts the emitted type. One test locks every struct down.
    for (const fields of [
      S.TASK_FIELDS, S.TASK_TIME_FIELDS, S.WORK_SCHEDULE_FIELDS, S.SEQUENCE_FIELDS,
      S.WORK_CALENDAR_FIELDS, S.WORK_TIME_FIELDS, S.RECURRENCE_PATTERN_FIELDS,
    ]) {
      const pascal = fields.map(f => f.pascalKey);
      const camel = fields.map(f => f.camelKey);
      expect(new Set(pascal).size).toBe(pascal.length);
      expect(new Set(camel).size).toBe(camel.length);
    }
  });
});

describe('bridge-schedule — IfcWorkCalendar translation (#4830)', () => {
  const internalCalendar = {
    globalId: 'cal-1', expressId: 64, name: 'Site calendar',
    description: 'Five-day week', objectType: 'ot', identification: 'CAL-1',
    predefinedType: 'FIRSTSHIFT',
    workingTimes: [{
      name: 'Weekdays', dataOrigin: 'USERDEFINED', userDefinedDataOrigin: 'hand',
      start: '2024-05-01', finish: '2024-12-31',
      recurrencePattern: {
        recurrenceType: 'WEEKLY',
        dayComponent: [], weekdayComponent: [1, 2, 3, 4, 5], monthComponent: [],
        interval: 1, occurrences: 30,
        timePeriods: [{ start: '07:00:00', end: '16:00:00' }],
      },
    }],
    exceptionTimes: [{ name: 'Shutdown', start: '2024-08-01', finish: '2024-08-14' }],
  };

  it('translateWorkCalendar renames every key, including the nested work times', () => {
    const out = S.translateWorkCalendar(internalCalendar);
    expect(out.GlobalId).toBe('cal-1');
    expect(out.ExpressId).toBe(64);
    expect(out.Name).toBe('Site calendar');
    expect(out.Description).toBe('Five-day week');
    expect(out.ObjectType).toBe('ot');
    expect(out.Identification).toBe('CAL-1');
    expect(out.PredefinedType).toBe('FIRSTSHIFT');

    const working = (out.WorkingTimes as Record<string, unknown>[])[0];
    expect(working.Name).toBe('Weekdays');
    expect(working.DataOrigin).toBe('USERDEFINED');
    expect(working.UserDefinedDataOrigin).toBe('hand');
    expect(working.Start).toBe('2024-05-01');
    expect(working.Finish).toBe('2024-12-31');

    const pattern = working.RecurrencePattern as Record<string, unknown>;
    expect(pattern.RecurrenceType).toBe('WEEKLY');
    expect(pattern.WeekdayComponent).toEqual([1, 2, 3, 4, 5]);
    expect(pattern.DayComponent).toEqual([]);
    expect(pattern.Interval).toBe(1);
    expect(pattern.Occurrences).toBe(30);
    // TimePeriods elements are re-keyed too — start/end -> Start/End.
    expect(pattern.TimePeriods).toEqual([{ Start: '07:00:00', End: '16:00:00' }]);

    const exception = (out.ExceptionTimes as Record<string, unknown>[])[0];
    expect(exception.Name).toBe('Shutdown');
    // No recurrence on this one — must stay undefined, not become `{}`.
    expect(exception.RecurrencePattern).toBeUndefined();
  });

  it('translateWorkSchedule carries CalendarGlobalIds', () => {
    const out = S.translateWorkSchedule({
      globalId: 'ws-1', expressId: 30, name: 'Main', kind: 'WorkSchedule',
      taskGlobalIds: ['t-1'], calendarGlobalIds: ['cal-1'],
    });
    expect(out.CalendarGlobalIds).toEqual(['cal-1']);
    expect(out.TaskGlobalIds).toEqual(['t-1']);
  });

  it('translateData surfaces WorkCalendars alongside the existing collections', () => {
    const out = S.translateData({
      hasSchedule: true,
      workSchedules: [],
      tasks: [],
      sequences: [],
      workCalendars: [internalCalendar],
    });
    expect(out.HasSchedule).toBe(true);
    expect((out.WorkCalendars as unknown[]).length).toBe(1);
    expect(((out.WorkCalendars as Record<string, unknown>[])[0]).Name).toBe('Site calendar');
  });

  it('translateData tolerates an extraction with no workCalendars key at all', () => {
    // Legacy in-memory extractions (pre-#4830 producers) omit the field; the
    // bridge must answer with an empty array rather than throwing.
    const out = S.translateData({ hasSchedule: true, workSchedules: [], tasks: [], sequences: [] });
    expect(out.WorkCalendars).toEqual([]);
  });

  it('the emitted TS return type declares WorkCalendars on bim.schedule.data()', () => {
    expect(S.DATA_RETURN).toContain('WorkCalendars: Array<');
    expect(S.WORK_CALENDAR_RETURN).toContain('WorkingTimes: Array<');
    expect(S.WORK_CALENDAR_RETURN).toContain('ExceptionTimes: Array<');
    expect(S.WORK_TIME_RETURN).toContain('RecurrencePattern?:');
  });
});
