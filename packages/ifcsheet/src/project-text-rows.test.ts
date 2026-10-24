/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Text rows (#186) survive the engine's project reader, the one reader the app's open and `ifcsheet check --project` share. */

import { describe, expect, it } from 'vitest';
import { readProjectFile } from './project-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const text = (schedules: unknown[]) => JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', schedules });
const row = { id: 'r1', label: 'Maker', cells: { d1: { text: 'Schüco', about: 'D1 Door 900×2100' } } };

describe('readProjectFile reads the text rows of a schedule', () => {
  it('keeps them on a joinery schedule, and on a part', () => {
    const read = readProjectFile(text([
      { id: 's1', name: 'Doors', kind: 'door', createdAt: 1, textRows: [row] },
      { id: 's2', name: 'Part', kind: 'all', createdAt: 1, sub: { parent: 's1', filter: { kinds: ['door'] } } },
    ]));
    expect(read.schedules[0].textRows).toEqual([row]);
    expect(read.schedules[1].textRows).toBeUndefined();
  });

  it('drops them from a non-joinery schedule, and leaves the key absent when there are none', () => {
    const read = readProjectFile(text([
      { id: 's1', name: 'Materials', kind: 'materials', createdAt: 1, textRows: [row] },
      { id: 's2', name: 'Doors', kind: 'door', createdAt: 1, textRows: [] },
      { id: 's3', name: 'Windows', kind: 'window', createdAt: 1 },
    ]));
    for (const s of read.schedules) expect('textRows' in s).toBe(false);
  });
});
