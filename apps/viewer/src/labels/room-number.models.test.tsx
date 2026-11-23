/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The app reads a room's number by the engine's rule (`roomNumberOf`): a room whose LongName only repeats its Name has
 * none, so its tag does not print the name twice (the demo model bloc-p4 writes every room that way), and a room with a
 * number of its own keeps it (AC20-FZK-Haus, room 4 "Schlafzimmer").
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { labelElementByGlobalId } from '@/labels/label-element.js';
import { resetProject } from '@/project/project-store.js';

const open = async (id: string, path: string): Promise<void> => {
  resetProject();
  seedModel(id, 0, await parseStep(readFileSync(resolve(process.cwd(), path))), 1);
};
afterEach(() => cleanup());

describe('a room\'s number, as a tag reads it in the app', () => {
  it('is nothing for a room whose LongName repeats its Name (bloc-p4)', async () => {
    await open('bloc', 'public/samples/bloc-p4.ifc');
    const room = labelElementByGlobalId('1zwXMmJcDF7Q9wa$FvR1gO');
    assert.ok(room, 'the room is in the model');
    assert.equal(room.attribute('Name'), 'Dormitor ap.2');
    assert.equal(room.attribute('LongName'), 'Dormitor ap.2');
    assert.equal(room.attribute('RoomNumber'), '');
  });

  it('is the Name for a room a different LongName names (AC20-FZK-Haus)', async () => {
    await open('fzk', 'src/test/__fixtures__/AC20-FZK-Haus.ifc');
    const room = labelElementByGlobalId('347jFE2yX7IhCEIALmupEH');
    assert.ok(room, 'the room is in the model');
    assert.equal(room.attribute('LongName'), 'Schlafzimmer');
    assert.equal(room.attribute('RoomNumber'), '4');
  });
});
