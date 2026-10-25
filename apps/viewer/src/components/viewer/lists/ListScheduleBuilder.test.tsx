/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #78: the builder in the project drawer and the card of a placed list schedule, against AC20-FZK-Haus. The builder offers the model's own
 * classes and columns, saves what was picked as a project schedule and hangs it on a sheet; the card hides and moves columns, and the sheet follows.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { loadUrbanModel } from '@/test/urban-fixture';
import { resetProject, useProjectStore } from '@/project/project-store';
import { resetSectionChoices } from '@/components/viewer/wall/card-section-state';
import { scheduleById } from '@/joinery/schedules';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import type { ScheduleLayout, SchedulePrim } from '@/joinery/schedule-layout';
import { ListScheduleAdd } from './ListScheduleAdd';
import { ListScheduleCard } from './ListScheduleCard';

const FZK = resolve(import.meta.dirname, '../../../test/__fixtures__/AC20-FZK-Haus.ifc');
type Text = Extract<SchedulePrim, { kind: 'text' }>;
const texts = (l: ScheduleLayout): string[] => l.prims.filter((p): p is Text => p.kind === 'text').map((p) => p.text);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => { setter.call(select, value); select.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
const body = () => document.body;
const button = (label: string) => [...body().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith(label))!;
const addColumn = () => [...body().querySelectorAll<HTMLLabelElement>('dialog label')].find((l) => l.textContent?.startsWith('Add a column'))!.querySelector('select')!;
const box = (label: string) => body().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

async function printed(sheetId: string): Promise<string[]> {
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
  const id = sheet.viewports![0].viewId;
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  for (let i = 0; i < 100 && !(layouts as unknown as ReturnType<typeof useSheetSchedules> | null)?.get(id); i++) await settle();
  const out = texts((layouts as unknown as ReturnType<typeof useSheetSchedules>).get(id)!);
  cleanup();
  return out;
}

beforeEach(async () => {
  resetProject(); resetSectionChoices();
  await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)), []);
});
afterEach(() => cleanup());

describe('New schedule in the drawer', () => {
  it('builds walls by type with the count and the area from the model\'s own classes and columns, and hangs it on a sheet', async () => {
    let went: string | null = null;
    render(<ListScheduleAdd className="add" go={(id) => { went = id; }} />);
    click(button('+ New schedule'));
    assert.ok(body().querySelector('dialog[aria-label="New schedule"]'), 'the builder opened');
    assert.ok(button('IfcWallStandardCase (13)'), 'the model\'s classes are offered, with their counts');
    click(button('IfcWallStandardCase (13)'));
    const add = addColumn();
    assert.ok([...add.options].some((o) => o.textContent === 'NetSideArea'), `the model's quantities are offered: ${[...add.options].map((o) => o.textContent).slice(0, 40).join('|')}`);
    choose(add, JSON.stringify(['attribute', null, 'Type']));
    choose(addColumn(), JSON.stringify(['quantity', 'BaseQuantities', 'NetSideArea']));
    click(box('Group by: Type'));
    click(box('Sum: BaseQuantities.NetSideArea'));
    await settle();
    assert.ok(button('Create and place on a sheet') && !button('Create and place on a sheet').disabled);
    click(button('Create and place on a sheet'));

    const schedule = (useProjectStore.getState().schedules ?? []).find((s) => s.kind === 'list')!;
    assert.equal(schedule.name, 'Schedule');
    assert.deepEqual(schedule.list, {
      filter: { classes: ['IfcWallStandardCase'] },
      columns: [{ id: 'attribute::Type', source: 'attribute', propertyName: 'Type' }, { id: 'quantity:BaseQuantities:NetSideArea', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
      groupBy: ['attribute::Type'], sum: ['quantity:BaseQuantities:NetSideArea'],
    });
    assert.ok(went, 'the drawer steps into the new sheet');
    const drawn = await printed(went!);
    assert.deepEqual(drawn.slice(1, 4), ['Type', 'Count', 'NetSideArea (m²)']);
    assert.equal(drawn[drawn.length - 2], '13');
  });

  it('cannot create a schedule with no column', () => {
    render(<ListScheduleAdd className="add" go={() => undefined} />);
    click(button('+ New schedule'));
    assert.ok(button('Create and place on a sheet').disabled);
    assert.ok(body().textContent?.includes('No column yet'));
  });
});

describe('the card of a list schedule', () => {
  const TYPE = { id: 't', source: 'attribute', propertyName: 'Type' } as const;
  const NAME = { id: 'n', source: 'attribute', propertyName: 'Name' } as const;

  it('hides a column and moves another; the sheet and the saved definition follow', async () => {
    const { addListScheduleToSet } = await import('@/joinery/list-schedule-actions');
    const sheetId = addListScheduleToSet('Walls', { filter: { classes: ['IfcWallStandardCase'] }, columns: [TYPE, NAME] });
    const id = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!.viewports![0].viewId;
    const view = render(<ListScheduleCard schedule={scheduleById(id)!} />);
    openSection(view, 'Table');
    click(view.querySelector('input[aria-label="Hide Name"]')!);
    assert.equal(scheduleById(id)!.list!.columns[1].hidden, true);
    assert.deepEqual((await printed(sheetId)).slice(0, 2), ['Walls', 'Type']);
    cleanup();
    const again = render(<ListScheduleCard schedule={scheduleById(id)!} />);
    openSection(again, 'Table');
    click(again.querySelector('button[aria-label="Move Name up"]')!);
    assert.deepEqual(scheduleById(id)!.list!.columns.map((c) => c.id), ['n', 't']);
    click(again.querySelector('input[aria-label="Show Name"]')!);
    assert.equal(scheduleById(id)!.list!.columns[0].hidden, undefined, 'shown again, not marked');
    assert.deepEqual((await printed(sheetId)).slice(1, 3), ['Name', 'Type']);
  });

  it('is not there for any other schedule', () => {
    const view = render(<ListScheduleCard schedule={{ id: 'a', name: 'Joinery', kind: 'all', createdAt: 0 }} />);
    assert.equal(view.textContent, '');
  });
});
