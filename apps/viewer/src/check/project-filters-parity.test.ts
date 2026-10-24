/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, section 3: the filters by IFC class, predefined type and property read the same in the app and in the engine. The app reads the
 * project text with its own reader and builds the rows from its live store (`scheduleData`, `scheduleDataOf`); the engine reads the same
 * text with `readProjectFile` and builds them with `joineryScheduleData` / `scheduleOf`, which is what `ifcsheet check --project` runs.
 * Over a model whose openings have IsExternal true, false and absent (the engine's fixture), and over AC20-FZK-Haus with its real
 * Pset_DoorCommon values, both must agree on the project read, on the rows each schedule and part prints, and on the findings.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, describeReadiness, scheduleOf } from '@bimvoice/ifcsheet';
import { joineryScheduleData, readProjectFile, readinessWithProject } from '@bimvoice/ifcsheet/headless';
import { readinessOfModel } from '@bimvoice/ifcsheet/readiness-read';
import { parseProjectFile } from '@/project/project-file';
import { loadProjectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { parseStep } from '@/test/properties-panel-harness.js';
import { scheduleData } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { subReportChecks } from './sub-report-check';

type Store = Awaited<ReturnType<typeof parseStep>>;
const EXT_INT = new URL('../../../../packages/ifcsheet/src/__fixtures__/exterior-interior.ifc', import.meta.url);
const FZK = new URL('./../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const stores = new Map<string, Store>();
// A model with no storey, element or space has no findings at all (`modelReadiness`): the fixture's two storeys, as the engine's `openModel` counts them.
const STOREYS = ['Ground', 'First'];

async function open(url: URL): Promise<Store> {
  const store = stores.get(url.href) ?? await parseStep(new Uint8Array(readFileSync(url)));
  stores.set(url.href, store);
  useViewerStore.setState({ models: new Map([['m', { ifcDataStore: store, name: 'm.ifc' }]]) } as never);
  return store;
}
beforeEach(() => resetProject());
afterEach(() => useViewerStore.setState({ models: new Map() } as never));

const ids = (d: { entries: { occurrences: { globalId: string }[] }[] }) => d.entries.flatMap((e) => e.occurrences.map((o) => o.globalId)).sort();
const guid = (...letters: string[]) => letters.map((l) => `00000000000000000000${l}0`).sort();

const projectText = (schedules: unknown[]) => JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Filters', schedules });
const schedule = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, kind: 'all', createdAt: 1, scale: 50, ...extra });
const part = (id: string, name: string, filter: Record<string, unknown>) => schedule(id, name, { sub: { parent: 's1', filter } });

/** Load `text` into the app and read it headless; they must have read the same project. */
function load(text: string) {
  const doc = parseProjectFile(text);
  loadProjectDocument(doc);
  const project = readProjectFile(text);
  assert.deepEqual(project.schedules, doc.schedules);
  return project;
}

describe('exterior and interior, over a model with IsExternal true, false and absent', () => {
  const external = { properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] };
  const interior = { properties: [{ name: 'IsExternal', op: 'notEquals', value: 'true' }] };

  it('the app and the engine list the same elements in each part, and find the pair a partition', async () => {
    const store = await open(EXT_INT);
    const project = load(projectText([schedule('s1', 'Joinery'), part('s2', 'Exterior', external), part('s3', 'Interior', interior)]));
    const schedules = useProjectStore.getState().schedules ?? [];
    const engineWhole = joineryScheduleData([{ modelId: 'm', dataStore: store, view: null }], project, 'all', undefined, ['isexternal']);
    assert.deepEqual(engineWhole, scheduleData('all'), 'the rows, with the properties the filters read');
    const byPart = (id: string) => ({
      app: ids(scheduleDataOf(schedules.find((s) => s.id === id)!)),
      engine: ids(scheduleOf(project.schedules, project.schedules.find((s) => s.id === id)!, engineWhole)),
    });
    assert.deepEqual(byPart('s2'), { app: guid('A', 'D', 'E', 'G'), engine: guid('A', 'D', 'E', 'G') });
    assert.deepEqual(byPart('s3'), { app: guid('B', 'C', 'F', 'H'), engine: guid('B', 'C', 'F', 'H') });
    const inApp = readinessOfModel({ dataStore: store, storeys: STOREYS }, subReportChecks(schedules));
    const headless = readinessWithProject({ dataStore: store, storeys: STOREYS }, project, 'm');
    assert.deepEqual(inApp.filter((f) => f.kind.startsWith('subReport')), [], 'a partition: no duplicate, no gap');
    const [check] = subReportChecks(schedules);
    assert.deepEqual([check.parts.length, check.duplicates.length, check.gaps.length], [2, 0, 0], 'the check ran over the two parts and found nothing');
    assert.deepEqual(headless.map((f) => [f.kind, f.params]), inApp.map((f) => [f.kind, f.params]));
  });

  it('say the same of a pair that is not a partition: the elements that say nothing are in no part', async () => {
    const store = await open(EXT_INT);
    const project = load(projectText([schedule('s1', 'Joinery'), part('s2', 'Exterior', external), part('s3', 'Interior', { properties: [{ name: 'IsExternal', op: 'equals', value: 'false' }] })]));
    const inApp = readinessOfModel({ dataStore: store, storeys: STOREYS }, subReportChecks(useProjectStore.getState().schedules ?? []));
    const headless = readinessWithProject({ dataStore: store, storeys: STOREYS }, project, 'm');
    const gap = inApp.find((f) => f.kind === 'subReportGaps');
    assert.ok(gap, 'the store door and the borrowed light are in no part');
    assert.equal(gap.params.count, 2);
    assert.deepEqual(headless.map((f) => [f.kind, f.params, describeReadiness(f)]), inApp.map((f) => [f.kind, f.params, describeReadiness(f)]));
  });

  it('agree on a schedule with a filter of its own: the scope, and the parts cut from it', async () => {
    const store = await open(EXT_INT);
    const content = { filter: { classes: ['IfcDoor', 'IfcDoorStandardCase'], properties: [{ name: 'IsExternal', op: 'present' }] }, numbering: { marks: 'sequence' } };
    const project = load(projectText([schedule('s1', 'Joinery', { content }), part('s2', 'Gates', { predefined: ['GATE'] })]));
    const schedules = useProjectStore.getState().schedules ?? [];
    const engineWhole = joineryScheduleData([{ modelId: 'm', dataStore: store, view: null }], project, 'all', undefined, ['isexternal']);
    for (const id of ['s1', 's2']) {
      const app = scheduleDataOf(schedules.find((s) => s.id === id)!);
      const engine = scheduleOf(project.schedules, project.schedules.find((s) => s.id === id)!, engineWhole);
      assert.deepEqual(engine, app, `rows of ${id}`);
    }
    // The doors that say IsExternal (A, B, G and the standard-case H), and of those the gate.
    assert.deepEqual(ids(scheduleDataOf(schedules[0])), guid('A', 'B', 'G', 'H'));
    assert.deepEqual(ids(scheduleDataOf(schedules[1])), guid('G'));
  });
});

describe('AC20-FZK-Haus, with its real property values', () => {
  it('the app and the engine agree on the elements a class and a property test keep', async () => {
    const store = await open(FZK);
    const warm = { properties: [{ name: 'ThermalTransmittance', op: 'equals', value: '1.4' }] };
    const project = load(projectText([
      schedule('s1', 'Joinery'),
      part('s2', 'Warm doors', { ...warm, classes: ['IfcDoor'] }),
      part('s3', 'Fire exit', { properties: [{ name: 'FireExit', op: 'equals', value: 'false' }] }),
      part('s4', 'Rated', { properties: [{ name: 'FireRating', op: 'present' }] }),
    ]));
    const schedules = useProjectStore.getState().schedules ?? [];
    const engineWhole = joineryScheduleData([{ modelId: 'm', dataStore: store, view: null }], project, 'all', undefined, ['isexternal', 'thermaltransmittance', 'fireexit', 'firerating']);
    assert.deepEqual(engineWhole, scheduleData('all'));
    for (const id of ['s2', 's3', 's4']) {
      assert.deepEqual(scheduleOf(project.schedules, project.schedules.find((s) => s.id === id)!, engineWhole), scheduleDataOf(schedules.find((s) => s.id === id)!), id);
    }
    // Haustuer and Terrassentuer (U 1.4); Innentuer-2 (FireExit false); no FireRating has a value.
    assert.equal(ids(scheduleDataOf(schedules[1])).length, 2);
    assert.deepEqual(ids(scheduleDataOf(schedules[2])), ['0pGAjlJMP3ifYPATVF5xAR']);
    assert.deepEqual(ids(scheduleDataOf(schedules[3])), []);
  });
});
