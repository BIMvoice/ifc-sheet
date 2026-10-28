/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186 section 2 in the app: a schedule split into parts is checked for duplicates and gaps, on the card on the Wall and in
 * "What the model lacks", and both say what the engine's `checkSubReports` says about the same project.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSubReports, describeReadiness, typeLabel } from '@bimvoice/ifcsheet';
import { readinessOfModel } from '@bimvoice/ifcsheet/readiness-read';
import { cleanup, click, render } from '@/test/render.js';
import { openSection, sectionHeading } from '@/test/open-section.js';
import { resetSectionChoices } from '@/components/viewer/wall/card-section-state';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { parseStep } from '@/test/properties-panel-harness.js';
import { addSchedule, addSubReport, scheduleById, splitByKind } from '@/joinery/schedules.js';
import { occurrenceMark, scheduleData } from '@/joinery/schedule-data.js';
import { SubReportCard } from '@/components/viewer/wall/SubReportCard';
import { ReadinessList } from '@/components/viewer/sheets/ReadinessList';
import type { SetSkin } from '@/components/viewer/sheets/set-skin';
import { describeMissing } from './readiness-say';
import { subReportChecks } from './sub-report-check';

const skin = { note: 'note', heading: 'heading' } as unknown as SetSkin;
let ifcDataStore: Awaited<ReturnType<typeof parseStep>>;

beforeEach(async () => {
  resetProject();
  resetSectionChoices();
  ifcDataStore ??= await parseStep(new Uint8Array(readFileSync(new URL('../../public/samples/bloc-p4.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([['m', { ifcDataStore, name: 'bloc-p4.ifc' }]]) } as never);
});
afterEach(() => {
  cleanup();
  useViewerStore.setState({ models: new Map() } as never);
});

const rows = () => scheduleData('all');
const windows = () => rows().entries.filter((e) => e.kind === 'window');
const doors = () => rows().entries.filter((e) => e.kind === 'door');
const text = (el: HTMLElement) => el.textContent ?? '';

/** The sample's joinery, written out so the tests do not trust the code that reads it. */
describe('the sample the tests run on', () => {
  it('has doors and windows with elements to split', () => {
    // bloc-p4.ifc holds 86 doors and 89 windows (counted in the file); a vacuous sample would pass every test below.
    assert.equal(doors().reduce((n, e) => n + e.total, 0), 86);
    assert.equal(windows().reduce((n, e) => n + e.total, 0), 89);
    assert.ok(doors().length >= 2 && windows().length >= 2, 'two types of each');
  });
});

function split(): { parent: string; doorsPart: string; windowsPart: string } {
  const parent = addSchedule('all', 'Joinery');
  const [doorsPart, windowsPart] = splitByKind(parent, { door: 'Doors', window: 'Windows' });
  return { parent, doorsPart, windowsPart };
}

describe('a schedule split into parts that do not overlap', () => {
  it('says every element is in exactly one part, and the readiness list says nothing about it', () => {
    const { parent } = split();
    const card = render(<SubReportCard schedule={scheduleById(parent)!} />);
    openSection(card, 'Sub-reports'); // nothing to warn of: the section starts closed
    assert.match(text(card), /Every element is in exactly one part\./);
    assert.doesNotMatch(text(card), /More than one part|in no part/);
    cleanup();
    const list = render(<ReadinessList skin={skin} />);
    assert.doesNotMatch(text(list), /more than one part|in no part/);
  });
});

describe('an overlap', () => {
  it('names the repeated type and element on the schedule, on the part and in the readiness list', () => {
    const { parent, windowsPart } = split();
    const w = windows()[0];
    const pick = addSubReport(parent, 'Pick', { types: [w.key] })!;
    const expected = `${typeLabel(w)} ×${w.total} (${[...new Set(w.occurrences.map((o) => o.level))].join(', ')})`;
    const onParent = text(render(<SubReportCard schedule={scheduleById(parent)!} />));
    assert.match(onParent, /More than one part lists the same type or element \(Windows, Pick\)\./);
    assert.ok(onParent.includes(`Types: 1, elements: ${w.total}: ${expected}`), onParent);
    cleanup();
    const onPart = text(render(<SubReportCard schedule={scheduleById(pick)!} />));
    assert.ok(onPart.includes(expected), onPart);
    cleanup();
    const inList = text(render(<ReadinessList skin={skin} />));
    assert.ok(inList.includes(expected), inList);
    assert.equal(scheduleById(windowsPart)!.sub!.filter.kinds?.[0], 'window');
  });

  it('resolves with one click: keep the type in the first part, and the warning clears', () => {
    const { parent } = split();
    const w = windows()[0];
    const pick = addSubReport(parent, 'Pick', { types: [w.key] })!;
    const card = render(<SubReportCard schedule={scheduleById(parent)!} />);
    const fix = [...card.querySelectorAll('button')].find((b) => /^Keep the repeated types in "Windows" only/.test(b.textContent ?? ''));
    assert.ok(fix, 'the card offers the fix');
    click(fix);
    assert.deepEqual(scheduleById(pick)!.sub!.filter.types, []);
    assert.match(text(card), /Every element is in exactly one part\./);
  });
});

describe('the Sub-reports section (#290)', () => {
  const open = (el: HTMLElement) => sectionHeading(el, 'Sub-reports').getAttribute('aria-expanded');
  const said = (el: HTMLElement) => (sectionHeading(el, 'Sub-reports').textContent ?? '').replace(/^▸/, '');

  it('is closed with "N sub-reports" when the parts cover every element once, and open with the warning when two parts overlap', () => {
    const { parent } = split();
    assert.equal(open(render(<SubReportCard schedule={scheduleById(parent)!} />)), 'false');
    assert.equal(said(document.body), 'Sub-reports2 sub-reports');
    cleanup();
    const w = windows()[0];
    addSubReport(parent, 'Pick', { types: [w.key] });
    const card = render(<SubReportCard schedule={scheduleById(parent)!} />);
    assert.equal(open(card), 'true', 'a warning opens the section');
    assert.match(text(card), /More than one part lists the same type or element/);
    click(sectionHeading(card, 'Sub-reports'));
    assert.equal(said(card), 'Sub-reports3 sub-reports, duplicates', 'closed, it still names the problem');
  });

  it('opens a part that keeps everything when its overlap is the warning (its own settings are the defaults)', () => {
    const { parent } = split();
    const rest = addSubReport(parent, 'Rest', {})!;
    const card = render(<SubReportCard schedule={scheduleById(rest)!} />);
    assert.equal(open(card), 'true');
    click(sectionHeading(card, 'Sub-reports'));
    assert.equal(said(card), 'Sub-reportsKeeps everything, duplicates');
  });

  it('keeps open the section a warning opened once the warning is fixed, so the result is seen', () => {
    const { parent } = split();
    const w = windows()[0];
    const pick = addSubReport(parent, 'Pick', { types: [w.key] })!;
    const card = render(<SubReportCard schedule={scheduleById(parent)!} />);
    assert.equal(open(card), 'true');
    click([...card.querySelectorAll('button')].find((b) => /^Keep the repeated types in "Windows" only/.test(b.textContent ?? ''))!);
    assert.deepEqual(scheduleById(pick)!.sub!.filter.types, []);
    assert.equal(open(card), 'true');
    assert.match(text(card), /Every element is in exactly one part\./);
  });

  it('opens on a gap and names it when closed', () => {
    const parent = addSchedule('all', 'Joinery');
    addSubReport(parent, 'Doors', { types: [doors()[0].key] });
    addSubReport(parent, 'Windows', { kinds: ['window'] });
    const card = render(<SubReportCard schedule={scheduleById(parent)!} />);
    assert.equal(open(card), 'true');
    click(sectionHeading(card, 'Sub-reports'));
    assert.equal(said(card), 'Sub-reports2 sub-reports, gaps');
  });
});

describe('a gap', () => {
  it('names the elements and types no part keeps, and adds them in one click', () => {
    const parent = addSchedule('all', 'Joinery');
    const d = doors();
    const kept = d[0];
    const left = d.slice(1);
    const doorsPart = addSubReport(parent, 'Doors', { types: [kept.key] })!;
    addSubReport(parent, 'Windows', { kinds: ['window'] });
    if (left.length === 0) assert.fail('the sample needs two door types to leave one out');
    const card = render(<SubReportCard schedule={scheduleById(parent)!} />);
    const shown = text(card);
    assert.match(shown, /Some elements are in no part\./);
    assert.ok(shown.includes(`Types: ${left.length}, elements: ${left.reduce((n, e) => n + e.total, 0)}:`), shown);
    assert.ok(left.every((e) => shown.includes(typeLabel(e))), shown);
    const fix = [...card.querySelectorAll('button')].find((b) => /^Add the missing types to "Doors"/.test(b.textContent ?? ''));
    assert.ok(fix, 'the card offers the fix');
    click(fix);
    assert.deepEqual(scheduleById(doorsPart)!.sub!.filter.types, d.map((e) => e.key));
    assert.match(text(card), /Every element is in exactly one part\./);
  });
});

describe('the engine and the app agree on the same project', () => {
  it('say the same thing, in the same words, for an overlap and a gap together', () => {
    const parent = addSchedule('all', 'Joinery');
    const w = windows()[0];
    addSubReport(parent, 'Doors', { kinds: ['door'], types: doors().slice(1).map((e) => e.key) });
    addSubReport(parent, 'Windows', { kinds: ['window'] });
    addSubReport(parent, 'Pick', { types: [w.key] });
    // The engine, asked directly: the parts written out here, not read from the app's helper.
    const engine = checkSubReports({ id: parent, name: 'Joinery', data: rows() }, [
      { id: 'a', name: 'Doors', filter: { kinds: ['door'], types: doors().slice(1).map((e) => e.key) } },
      { id: 'b', name: 'Windows', filter: { kinds: ['window'] } },
      { id: 'c', name: 'Pick', filter: { types: [w.key] } },
    ], occurrenceMark);
    assert.ok(engine.duplicates.length > 0 && engine.gaps.length > 0, 'the project has both problems');
    const headless = readinessOfModel({ dataStore: ifcDataStore, storeys: [] }, [engine]).filter((f) => f.kind.startsWith('subReport'));
    const inApp = subReportChecks(useProjectStore.getState().schedules ?? []);
    assert.equal(inApp.length, 1);
    const appSays = (checks: typeof inApp) => readinessOfModel({ dataStore: ifcDataStore, storeys: [] }, checks).filter((f) => f.kind.startsWith('subReport'));
    assert.deepEqual(appSays(inApp).map((f) => [f.kind, f.params]), headless.map((f) => [f.kind, f.params]));
    // What the list on screen prints is the engine's sentence.
    const list = text(render(<ReadinessList skin={skin} />));
    for (const f of headless) {
      assert.ok(list.includes(describeReadiness(f).missing), `${f.kind}: ${list}`);
      assert.equal(describeMissing(f), describeReadiness(f).missing);
    }
  });
});
