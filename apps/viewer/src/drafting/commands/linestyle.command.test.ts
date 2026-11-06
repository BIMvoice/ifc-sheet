/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** LINESTYLE: a line of the generated drawing drawn in another pen in one view, one undo step, RESET (#189). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CENTRE_DASH_MM, PEN_TABLE, resolveViewGraphics, viewStyler } from '@bimvoice/ifcsheet';
import { undoDrafts } from '../draft-store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { draftCommandByName } from './registry';
import { lineStyleCommand } from './linestyle.command';
import type { DraftContext, ModelLinePick } from './types';

const wall: ModelLinePick = { globalId: '2O2Fr$t4X7Zf8NOew3FNr2', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
const other: ModelLinePick = { globalId: '1hOSvn6df7F8_7GcBWlR72', a: { x: 10, y: 0 }, b: { x: 10, y: 10 } };

function setup() {
  useProjectStore.setState({ views: [{ id: 'v', kind: 'plan' } as unknown as ProjectView], drafts: [], dirty: false });
  const said: string[] = [];
  const ctx = { viewId: 'v', layerId: 'walls', say: (key: string) => said.push(key) } as unknown as DraftContext;
  return { command: lineStyleCommand.create(ctx), said };
}

/** How the view draws `pick` now: the project's resolved graphics through the one styler, as the screen, the sheet, the PDF and the DXF do. */
function drawn(pick: ModelLinePick) {
  const view = useProjectStore.getState().views[0];
  const styler = viewStyler({ graphics: resolveViewGraphics(view, []), globalIdOf: (id) => (id === 1 ? pick.globalId : undefined) });
  return styler.line({ entityId: 1, ifcType: 'IfcWall', category: 'projection', line: { start: pick.a, end: pick.b } });
}
const lineStyles = () => useProjectStore.getState().views[0].graphics?.lineStyles;

describe('LINESTYLE on the model\'s own lines (#189)', () => {
  it('is a typed command', () => {
    assert.equal(draftCommandByName('linestyle'), lineStyleCommand);
  });

  it('sets the weight and the line type of a picked line in this view, and no other line', () => {
    const { command } = setup();
    const before = drawn(wall);
    assert.equal(command.onKeyword?.('heavy'), 'continue');
    assert.equal(command.onKeyword?.('centre'), 'continue');
    assert.equal(command.onKeyword?.('wibble'), undefined, 'a word that is no pen is not taken');
    assert.equal(command.onPickModelLine?.(wall, wall.a), 'continue');
    const after = drawn(wall);
    assert.equal(after.weight, PEN_TABLE.weights.heavy.projection);
    assert.deepEqual(after.dash, CENTRE_DASH_MM);
    assert.notEqual(after.weight, before.weight);
    assert.deepEqual(drawn(other), { ...before, kind: before.kind }, 'another line draws as before');
  });

  it('is one undo step per line, and Undo brings the category\'s pen back', () => {
    const { command } = setup();
    const before = drawn(wall);
    command.onKeyword?.('dashed');
    command.onKeyword?.('#cc0000');
    command.onPickModelLine?.(wall, wall.a);
    assert.equal(drawn(wall).stroke, '#cc0000');
    assert.ok(undoDrafts());
    assert.equal(lineStyles(), undefined);
    assert.deepEqual(drawn(wall), before);
  });

  it('keeps the pens already set when another is added, and RESET gives the line its own pen back', () => {
    const { command, said } = setup();
    command.onKeyword?.('heavy');
    command.onPickModelLine?.(wall, wall.a);
    command.onKeyword?.('centre');
    command.onPickModelLine?.(wall, wall.a);
    assert.deepEqual(lineStyles(), { [Object.keys(lineStyles() ?? {})[0]]: { weight: 'heavy', type: 'centre' } }, 'the weight stays when the line type is added');
    command.onKeyword?.('reset');
    command.onPickModelLine?.(wall, wall.a);
    assert.equal(lineStyles(), undefined, 'a view with no override keeps no field');
    assert.deepEqual(drawn(wall).dash, []);
    assert.ok(said.includes('drafting.msg.linestyleReset'));
  });

  it('says so when no pen was typed, and changes nothing', () => {
    const { command, said } = setup();
    command.onPickModelLine?.(wall, wall.a);
    assert.deepEqual(said, ['drafting.msg.linestyleNoPen']);
    assert.equal(lineStyles(), undefined);
  });
});
