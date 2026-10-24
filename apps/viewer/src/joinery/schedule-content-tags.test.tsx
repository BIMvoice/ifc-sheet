/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, section 3: the marks a plan tag shows are the schedule's marks. A tag reads the element's Tag (`labels/label-element.ts`); the
 * schedule writes its marks there (`Number elements`, `schedule-numbering.ts`); and a change of the schedule's numbering moves the Tags
 * that carried the old marks, so the tag on the plan says what the schedule says. One source: `occurrenceMark` over the numbered rows.
 * Run over the demo project, 86 doors and 89 windows.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { useViewerStore } from '@/store';
import { configureMutationView } from '@/utils/configureMutationView';
import { parseStep } from '@/test/properties-panel-harness.js';
import { labelElementOf } from '@/labels/label-element';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addSchedule, addSubReport } from './schedules';
import { setNumbering, setSort } from './schedule-content-actions';
import { writeOccurrenceNumbers, writeTags } from './schedule-numbering';
import { occurrenceMark, scheduleData } from './schedule-data';
import { scheduleDataOf } from './schedule-split';

const MODEL = 'm';
let ifcDataStore: Awaited<ReturnType<typeof parseStep>>;

beforeEach(async () => {
  resetProject();
  ifcDataStore ??= await parseStep(new Uint8Array(readFileSync(new URL('../../public/samples/bloc-p4.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([[MODEL, { ifcDataStore, name: 'bloc-p4.ifc' }]]), mutationViews: new Map(), storeEditors: new Map(), undoStacks: new Map(), redoStacks: new Map(), mutationBatchTags: new Map(), editEnabled: true } as never);
  // The model in Edit mode, as the app has it once a model is open.
  const view = new MutablePropertyView(ifcDataStore.properties ?? null, MODEL);
  configureMutationView(view, ifcDataStore);
  useViewerStore.getState().registerMutationView(MODEL, view);
});
afterEach(() => {
  useViewerStore.setState({ models: new Map(), mutationViews: new Map(), storeEditors: new Map(), editEnabled: false } as never);
});

/** What a plan tag of the element would print as its mark. */
const planMark = (id: number): string => labelElementOf(MODEL, id)!.attribute('Mark');

/** Every element of the schedule with the mark the schedule gives it. */
const marksOf = (scheduleId: string): Map<number, string> => {
  const data = scheduleDataOf(useProjectStore.getState().schedules!.find((s) => s.id === scheduleId)!);
  return new Map(data.entries.flatMap((e) => e.occurrences.map((o) => [o.expressId, occurrenceMark(e, o)] as const)));
};

describe('plan tags follow the schedule\'s numbering', () => {
  it('the demo project has the doors and windows the test counts on', () => {
    const data = scheduleData('all');
    assert.equal(data.entries.filter((e) => e.kind === 'door').reduce((n, e) => n + e.total, 0), 86);
    assert.equal(data.entries.filter((e) => e.kind === 'window').reduce((n, e) => n + e.total, 0), 89);
  });

  it('writing the numbers puts the schedule\'s marks on the plan tags', () => {
    const id = addSchedule('all', 'Joinery');
    const marks = marksOf(id);
    assert.equal(marks.size, 175);
    assert.deepEqual(writeOccurrenceNumbers(scheduleDataOf(useProjectStore.getState().schedules![0])), { written: 175, errors: [] });
    for (const [element, mark] of marks) assert.equal(planMark(element), mark);
  });

  it('a new first element number moves the tags that carried the old marks, and only those', () => {
    const id = addSchedule('all', 'Joinery');
    writeOccurrenceNumbers(scheduleDataOf(useProjectStore.getState().schedules![0]));
    const ids = [...marksOf(id).keys()];
    const [mine, theirs] = [ids[0], ids.at(-1)!];
    writeTags([{ modelId: MODEL, expressId: theirs, tag: 'FRONT-ENTRANCE' }]);
    const before = marksOf(id);
    setNumbering(id, { elementStart: 10 });
    const after = marksOf(id);
    assert.notEqual(after.get(mine), before.get(mine));
    for (const [element, mark] of after) assert.equal(planMark(element), element === theirs ? 'FRONT-ENTRANCE' : mark, `element ${element}`);
    // Independent of the code that wrote them: the first element of the first type is now numbered 10, not 1.
    const first = scheduleDataOf(useProjectStore.getState().schedules![0]).entries[0];
    assert.equal(planMark(first.occurrences[0].expressId), `${first.mark}.10`);
  });

  it('a sorted, re-marked schedule puts its new marks on the tags, and a part says the same', () => {
    const id = addSchedule('all', 'Joinery');
    writeOccurrenceNumbers(scheduleDataOf(useProjectStore.getState().schedules![0]));
    setSort(id, { by: 'count', descending: true });
    setNumbering(id, { marks: 'sequence', typeStart: 30 });
    const marks = marksOf(id);
    for (const [element, mark] of marks) assert.equal(planMark(element), mark);
    // The most numerous type comes first and is the first of its kind: D30 or W30.
    const data = scheduleDataOf(useProjectStore.getState().schedules![0]);
    assert.equal(data.entries[0].total, Math.max(...data.entries.map((e) => e.total)));
    assert.match(data.entries[0].mark, /^[DW]30$/);
    // A part cut from it names the same element with the same mark.
    const doors = addSubReport(id, 'Doors', { kinds: ['door'] })!;
    const part = scheduleDataOf(useProjectStore.getState().schedules!.find((s) => s.id === doors)!);
    assert.ok(part.entries.length > 0);
    for (const e of part.entries) for (const o of e.occurrences) assert.equal(occurrenceMark(e, o), marks.get(o.expressId));
  });

  it('a model whose tags were never written from the schedule is not touched by a change of numbering', () => {
    const id = addSchedule('all', 'Joinery');
    const some = [...marksOf(id).keys()].slice(0, 5);
    const before = some.map(planMark);
    setNumbering(id, { elementStart: 5 });
    assert.deepEqual(some.map(planMark), before);
  });

  it('where the tags cannot be written (Edit mode is off) the numbering still changes, and says why', () => {
    const id = addSchedule('all', 'Joinery');
    writeOccurrenceNumbers(scheduleDataOf(useProjectStore.getState().schedules![0]));
    const some = [...marksOf(id).keys()].slice(0, 3);
    const before = some.map(planMark);
    useViewerStore.setState({ editEnabled: false } as never);
    const out = setNumbering(id, { elementStart: 5 });
    assert.equal(out.written, 0);
    assert.match(out.errors.join(), /Edit mode/);
    assert.deepEqual(useProjectStore.getState().schedules![0].content, { numbering: { elementStart: 5 } });
    assert.deepEqual(some.map(planMark), before, 'the tags are as they were, and the card says so');
  });

  it('"Number elements" writes in the documentation edition: it is an attribute edit, one undo step per model', () => {
    const id = addSchedule('all', 'Joinery');
    const out = writeOccurrenceNumbers(scheduleDataOf(useProjectStore.getState().schedules![0]));
    assert.deepEqual(out, { written: 175, errors: [] });
    assert.equal(marksOf(id).size, 175);
    const s = useViewerStore.getState();
    assert.equal(s.undoStacks.get(MODEL)?.length, 175, 'one entry per tag...');
    assert.equal(new Set([...s.mutationBatchTags.values()]).size, 1, '...all in one batch, so Undo takes them back together');
  });
});
