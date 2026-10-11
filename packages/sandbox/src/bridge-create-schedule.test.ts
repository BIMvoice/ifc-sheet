/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The `bim.create.*` scheduling write surface — registration shape plus one
 * real sandbox round trip that authors an IfcWorkCalendar through the
 * bridge and reads the STEP back out of `bim.create.toIfc`.
 *
 * Registration alone is not enough to prove a method works: a name can sit
 * in `SCHEDULE_SPECIAL_METHOD_NAMES` while `buildScheduleMethods()` never
 * emits a schema for it, and the schema can be emitted while `call` throws.
 * The eval below exercises the whole path.
 */

import { describe, expect, it } from 'vitest';
import type { BimContext } from '@ifc-lite/sdk';
import { NAMESPACE_SCHEMAS } from './bridge-schema.js';
import { buildScheduleMethods, SCHEDULE_SPECIAL_METHOD_NAMES } from './bridge-create-schedule.js';
import { createSandbox } from './sandbox.js';

const CREATE_ONLY_PERMISSIONS = {
  query: false,
  mutate: false,
  viewer: false,
  export: true,
  model: false,
  lens: false,
  files: false,
} as const;

describe('bim.create scheduling method registration', () => {
  it('registers every SCHEDULE_SPECIAL_METHOD_NAMES entry as a real create-namespace method', () => {
    // The two lists are maintained in different files (`bridge-create.ts`
    // reads the names; `buildScheduleMethods()` emits the schemas), so a
    // name added to one and not the other is silently a no-op.
    const createNamespace = NAMESPACE_SCHEMAS.find(schema => schema.name === 'create');
    expect(createNamespace).toBeDefined();
    const registered = new Set(createNamespace!.methods.map(m => m.name));
    for (const name of SCHEDULE_SPECIAL_METHOD_NAMES) {
      expect(registered.has(name), `${name} is named but not registered`).toBe(true);
    }
    const emitted = new Set(buildScheduleMethods().map(m => m.name));
    for (const name of SCHEDULE_SPECIAL_METHOD_NAMES) {
      expect(emitted.has(name), `${name} has no schema`).toBe(true);
    }
  });

  it('shapes addIfcWorkCalendar like its addIfcWorkSchedule sibling (#4830)', () => {
    const createNamespace = NAMESPACE_SCHEMAS.find(schema => schema.name === 'create')!;
    const cal = createNamespace.methods.find(m => m.name === 'addIfcWorkCalendar');
    expect(cal).toBeDefined();
    expect(cal!.args).toEqual(['number', 'dump']);
    expect(cal!.paramNames).toEqual(['handle', 'params']);
    expect(cal!.tsReturn).toBe('number');
    // The params type must surface the two nested lists and the enum, or
    // script authors get `any` where the schema is the only documentation.
    const paramsType = cal!.tsParamTypes![1]!;
    expect(paramsType).toContain('WorkingTimes?:');
    expect(paramsType).toContain('ExceptionTimes?:');
    expect(paramsType).toContain('RecurrencePattern?:');
    expect(paramsType).toContain("'FIRSTSHIFT'");
    expect(cal!.llmSemantics?.requiredKeys).toEqual(['Name']);
  });

  it('shapes assignCalendarToTasks like the other relAssign aliases', () => {
    const createNamespace = NAMESPACE_SCHEMAS.find(schema => schema.name === 'create')!;
    const assign = createNamespace.methods.find(m => m.name === 'assignCalendarToTasks');
    expect(assign).toBeDefined();
    expect(assign!.args).toEqual(['number', 'number', 'dump']);
    expect(assign!.paramNames).toEqual(['handle', 'calendarId', 'taskIds']);
    expect(assign!.tsParamTypes).toEqual([undefined, undefined, 'number[]']);
    expect(assign!.tsReturn).toBe('number');
  });
});

describe('bim.create.addIfcWorkCalendar end-to-end through the sandbox (#4830)', () => {
  it('authors a calendar, assigns it to a task, and emits both in the STEP', async () => {
    const sandbox = await createSandbox({} as BimContext, {
      permissions: CREATE_ONLY_PERMISSIONS,
    });
    try {
      const script = `
        const h = bim.create.project({ Name: "Calendar test" });
        const cal = bim.create.addIfcWorkCalendar(h, {
          Name: "Site calendar",
          PredefinedType: "FIRSTSHIFT",
          WorkingTimes: [{
            Name: "Weekdays",
            Start: "2024-05-01",
            Finish: "2024-12-31",
            RecurrencePattern: {
              RecurrenceType: "WEEKLY",
              WeekdayComponent: [1, 2, 3, 4, 5],
              Interval: 1,
              TimePeriods: [{ StartTime: "07:00:00", EndTime: "16:00:00" }]
            }
          }]
        });
        const task = bim.create.addIfcTask(h, { Name: "Install walls" });
        bim.create.assignCalendarToTasks(h, cal, [task]);
        bim.create.toIfc(h).content;
      `;
      const result = await sandbox.eval(script, { typescript: false });
      const content = result.value as string;
      expect(content).toContain('IFCWORKCALENDAR');
      expect(content).toContain("'Site calendar'");
      expect(content).toContain('.FIRSTSHIFT.');
      expect(content).toContain('IFCWORKTIME');
      expect(content).toContain('.WEEKLY.');
      expect(content).toContain('(1,2,3,4,5)');
      expect(content).toContain("IFCTIMEPERIOD('07:00:00','16:00:00')");
      const calendarId = content.match(/#(\d+)=IFCWORKCALENDAR\([^\n]*'Site calendar'/)?.[1];
      const taskId = content.match(/#(\d+)=IFCTASK\([^\n]*'Install walls'/)?.[1];
      expect(calendarId).toBeDefined();
      expect(taskId).toBeDefined();
      expect(content).toMatch(new RegExp(
        `=IFCRELASSIGNSTOCONTROL\\([^\\n]*\\(#${taskId}\\),\\$,#${calendarId}\\);`,
      ));
    } finally {
      sandbox.dispose();
    }
  });
});
