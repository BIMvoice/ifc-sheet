/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The finishes schedule `ifcsheet build --project` prints where a sheet places it (#581, 2 of 8), on rooms-with-finishes.ifc: AC20-FZK-Haus
 * has no covering, so a test on it would compare two empty tables. The fixture has no geometry, so the model is the parsed store; a
 * finishes schedule reads no mesh. The app's side is `apps/viewer/src/project/cli-schedule-finishes.parity.test.tsx`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectSheet } from './document.js';
import type { OpenedModel } from './model.js';
import { readProjectSet } from './project-set.js';
import { projectSheetOptions, type LeftOut } from './project-sheets.js';
import { roomInputsOf, scheduleModelsOf } from './project.js';
import { roomFinishes } from './room-finishes.js';
import type { ScheduleLayout } from './schedule-prim.js';

vi.mock('./site-frame.js', async (original) => ({ ...(await original<typeof import('./site-frame.js')>()), siteFrameOf: () => ({ north: null, frameOffset: { x: 0, y: 0, z: 0 } }) }));

const FIXTURE = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/rooms-with-finishes.ifc', import.meta.url));
const sheet = { id: 's1', number: 'X-901', name: 'Finishes', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'fin', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] } as unknown as ProjectSheet;
const finishes = { id: 'fin', name: 'Room finishes', kind: 'finishes', createdAt: 0 } as const;

const texts = (layout: ScheduleLayout): string[] => layout.prims.flatMap((p) => ('text' in p && typeof p.text === 'string' ? [p.text] : []));

async function printed(language: string, store?: IfcDataStore): Promise<{ texts: string[]; said: LeftOut[] }> {
  const dataStore = store ?? await new IfcParser().parseColumnar(new Uint8Array(readFileSync(FIXTURE)).buffer as ArrayBuffer, { disableWorkerScan: true });
  const set = { ...readProjectSet({}), sheets: [sheet] };
  const said: LeftOut[] = [];
  const { schedules } = projectSheetOptions({ set, schedules: [finishes] }, { dataStore, meshes: [] } as unknown as OpenedModel, language, language, 'm.ifc', (left) => said.push(left));
  const pager = schedules!.pages!.get('fin');
  return { texts: pager ? texts(pager({ sheets: [sheet], sheet, vp: sheet.viewports![0] })) : [], said };
}

describe.skipIf(!existsSync(FIXTURE))('the finishes schedule prints where a sheet places it, on rooms-with-finishes.ifc', () => {
  it('reads the three rooms with the finishes and areas of the fixture', async () => {
    const dataStore = await new IfcParser().parseColumnar(new Uint8Array(readFileSync(FIXTURE)).buffer as ArrayBuffer, { disableWorkerScan: true });
    const rooms = roomFinishes(roomInputsOf(scheduleModelsOf({ dataStore }, 'm.ifc')));
    expect(rooms.map((r) => r.number)).toEqual(['101', '102', '103']);
    expect(rooms[0].finishes.floor[0]).toMatchObject({ name: 'Oak parquet', area: 24.5 });
    expect(rooms[1].finishes.wall[0]).toMatchObject({ name: 'Oak veneer panel', area: 9.5, source: 'containment' });
    expect(rooms[2].finishes.floor[0]).toMatchObject({ name: 'Concrete, sealed', area: null, source: 'property' });
  });

  it('is a pager, prints the table in English and says nothing is left out', async () => {
    const { texts: t, said } = await printed('en');
    expect(said).toEqual([]);
    expect(t).toEqual(expect.arrayContaining(['Room finishes', 'Living room', 'Oak parquet', '24.50', '52.00', '24.80', 'Oak veneer panel', '9.50', 'Concrete, sealed', 'Acoustic tile', 'Floor', 'Ceiling', 'Area m²']));
  });

  it('words the table in Romanian with the decimal comma', async () => {
    const { texts: t } = await printed('ro');
    expect(t).toEqual(expect.arrayContaining(['Pardoseală', 'Perete', 'Tavan', 'Arie m²', 'Încăpere', '24,50']));
    expect(t.filter((word) => word === 'Floor')).toEqual([]);
  });

  it('says so on stderr when the model has no room, and prints nothing', async () => {
    const { texts: t, said } = await printed('en', {} as IfcDataStore);
    expect(t).toEqual([]);
    expect(said).toEqual([{ sheet: 'X-901 Finishes', what: 'the finishes schedule "Room finishes" (the model has no room)' }]);
  });
});
