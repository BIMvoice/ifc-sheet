/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #260: `ifcsheet check --project` and the app say the same thing about the same project and model. The app reads
 * the project file with its own reader (`parseProjectFile`) and builds the schedule rows from its live store
 * (`scheduleData`); the engine reads the same text with `readProjectFile` and builds them with `joineryScheduleData`.
 * Both are run over one project that has a catalogue, a symbol mapping (by dimension, by alias, a per-type choice, a per-element "no symbol")
 * and three overlapping or incomplete parts, and must agree on the project read, the rows and the findings.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, describeReadiness } from '@bimvoice/ifcsheet';
import { joineryScheduleData, readProjectFile, readinessWithProject } from '@bimvoice/ifcsheet/headless';
import { readinessOfModel } from '@bimvoice/ifcsheet/readiness-read';
import { PROJECT_MIGRATIONS } from '@/project/project-migrations';
import { parseProjectFile } from '@/project/project-file';
import { loadProjectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { parseStep } from '@/test/properties-panel-harness.js';
import { scheduleData } from '@/joinery/schedule-data';
import { subReportChecks } from './sub-report-check';

let ifcDataStore: Awaited<ReturnType<typeof parseStep>>;

beforeEach(async () => {
  resetProject();
  ifcDataStore ??= await parseStep(new Uint8Array(readFileSync(new URL('../../public/samples/bloc-p4.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([['m', { ifcDataStore, name: 'bloc-p4.ifc' }]]) } as never);
});
afterEach(() => {
  useViewerStore.setState({ models: new Map() } as never);
});

const door = (id: string, name: string, mark: string, width: number, height: number) => ({ id, kind: 'door', name, mark, width, height });

function projectText(mapping: Record<string, unknown>): string {
  const schedule = (id: string, name: string, sub?: unknown) => ({ id, name, kind: 'all', createdAt: 1, scale: 50, ...(sub ? { sub } : {}) });
  return JSON.stringify({
    format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Bloc P4',
    // The catalogue: 800x2100 and 900x2100 doors. The mapping decides which element takes which (the file's doors are all named "Door").
    joineryTypes: [door('d800', 'Flat door', 'T1', 0.8, 2.1), door('d900', 'Bathroom door', 'T2', 0.9, 2.1)],
    joineryMapping: { byName: true, byDimensions: true, tolerance: 0.02, aliases: {}, types: {}, elements: {}, ...mapping },
    schedules: [
      schedule('s1', 'Joinery'),
      schedule('s2', 'Doors', { parent: 's1', filter: { kinds: ['door'], types: ['d800'] } }),
      schedule('s3', 'Windows', { parent: 's1', filter: { kinds: ['window'], levels: ['Parter', 'Etaj 1'] } }),
      schedule('s4', 'Pick', { parent: 's1', filter: { types: ['d800', 'untyped:window:750×2250'] } }),
    ],
  });
}

/** The mappings run: by dimension, with one element given another entry and one given none; and by name (an alias that every door matches). */
const mappings = (gids: string[]) => ({
  'by dimension, with manual choices': { elements: { [gids[0]]: null, [gids[1]]: 'd900' } },
  'by name, through an alias': { aliases: { d900: ['Door'] } },
});

describe('the engine and the app read the same project and build the same rows', () => {
  for (const name of Object.keys(mappings(['a', 'b']))) {
    it(`agree on the project read, the schedule rows and the findings: ${name}`, () => {
      const [first, second] = scheduleData('all').entries.filter((e) => e.kind === 'door').flatMap((e) => e.occurrences.map((o) => o.globalId));
      const text = projectText(mappings([first, second])[name as keyof ReturnType<typeof mappings>]);
      const doc = parseProjectFile(text);
      loadProjectDocument(doc);
      const project = readProjectFile(text);
      assert.deepEqual(project.schedules, doc.schedules);
      assert.deepEqual(project.joineryTypes, doc.joineryTypes);
      assert.deepEqual(project.joineryMapping, doc.joineryMapping);

      for (const kind of ['all', 'door', 'window'] as const) {
        const engine = joineryScheduleData([{ modelId: 'm', dataStore: ifcDataStore, view: null }], project, kind);
        assert.deepEqual(engine, scheduleData(kind), `rows of ${kind}`);
      }
      // The mapping did something: the catalogue's types are in the rows.
      const rows = scheduleData('all').entries;
      const heldBy = (key: string) => rows.find((e) => e.key === key)?.occurrences.map((o) => o.globalId) ?? [];
      if (name.startsWith('by dimension')) {
        assert.ok(heldBy('d800').length > 0, 'doors mapped by dimension');
        assert.ok(!heldBy('d800').includes(first) && !heldBy('d900').includes(first), 'an element told it has no symbol');
        assert.ok(heldBy('d900').includes(second), 'an element given another entry');
      } else {
        assert.equal(heldBy('d900').length, 86, 'every door is named Door, so the alias takes them all');
      }

      const inApp = readinessOfModel({ dataStore: ifcDataStore, storeys: [] }, subReportChecks(useProjectStore.getState().schedules ?? []));
      const headless = readinessWithProject({ dataStore: ifcDataStore, storeys: [] }, project, 'm');
      assert.ok(inApp.some((f) => f.kind === 'subReportDuplicates') && inApp.some((f) => f.kind === 'subReportGaps'), 'the project has both problems');
      assert.deepEqual(headless.map((f) => [f.kind, f.params, describeReadiness(f)]), inApp.map((f) => [f.kind, f.params, describeReadiness(f)]));
    });
  }

  it('reads an old project the way the app does: without a version, a sub-report or a catalogue', () => {
    const text = JSON.stringify({ format: PROJECT_FILE_FORMAT, name: 'Old', schedules: [{ id: 's1', name: 'Joinery', kind: 'door' }, { id: 's2', kind: 'materials', sub: { parent: 's1' } }, 'junk'] });
    const doc = parseProjectFile(text);
    const project = readProjectFile(text);
    assert.deepEqual(project.schedules, doc.schedules);
    assert.deepEqual(project.joineryTypes, doc.joineryTypes);
    assert.equal(project.schedules.find((s) => s.id === 's2')?.sub, undefined, 'only a joinery list can be split');
  });
});

describe('the headless reader needs no migration the app has', () => {
  it('has none to carry over: the day PROJECT_MIGRATIONS gets a step, `readProjectFile` must run it too', () => {
    assert.deepEqual(Object.keys(PROJECT_MIGRATIONS), []);
  });
});
