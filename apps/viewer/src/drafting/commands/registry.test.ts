/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The drafting command registry finds each `*.command.ts` and refuses two commands with one id or one typed name. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleCommands, DRAFT_COMMANDS, draftCommandByName } from './registry';
import type { DraftCommandDef } from './types';

const command = (id: string, ...aliases: string[]) => ({ id, aliases, labelKey: 'drafting.snap', create: () => { throw new Error('not run'); } }) as unknown as DraftCommandDef;

describe('the drafting command registry', () => {
  it('finds the commands a *.command.ts file exports, by id and by typed name', () => {
    assert.ok(DRAFT_COMMANDS.some((c) => c.id === 'underlayscale'));
    assert.equal(draftCommandByName('ulscale')?.id, 'underlayscale');
  });

  it('puts the found commands after the frozen ones, sorted by id whatever the order they are found in', () => {
    const frozen = [command('line', 'LINE')];
    const ids = (list: DraftCommandDef[]) => list.map((c) => c.id);
    assert.deepEqual(ids(assembleCommands(frozen, [command('zed', 'ZED'), command('arc', 'ARC')])), ['line', 'arc', 'zed']);
    assert.deepEqual(ids(assembleCommands(frozen, [command('arc', 'ARC'), command('zed', 'ZED')])), ['line', 'arc', 'zed']);
  });

  it('refuses a second command with an id or a typed name already taken', () => {
    assert.throws(() => assembleCommands([command('line', 'LINE')], [command('line', 'LN')]), /share the id "line"/);
    assert.throws(() => assembleCommands([command('line', 'LINE', 'L')], [command('leader', 'L')]), /share the typed name "L"/);
  });

  it('lists each command once', () => {
    const ids = DRAFT_COMMANDS.map((c) => c.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  });
});
