/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Which drafted entity a point picks when a line lies over a hatch (#670). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nearestEntity } from './session-entities.js';
import type { DraftEntity, EntityShape } from './types.js';

const entity = (id: string, shape: EntityShape): DraftEntity => ({ id, viewId: 'v', layerId: 'l', shape, params: {} });
const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const hatch = entity('hatch', { type: 'hatch', loops: [square], pattern: 'ANSI31', scale: 1, angle: 0 });
const line = entity('line', { type: 'line', a: { x: 2, y: 5 }, b: { x: 8, y: 5 } });

describe('picking a line over a hatch (#670)', () => {
  it('picks the line near it, whichever was drawn last', () => {
    assert.equal(nearestEntity([hatch, line], { x: 5, y: 5.1 }, 0.3)?.id, 'line');
    assert.equal(nearestEntity([line, hatch], { x: 5, y: 5.1 }, 0.3)?.id, 'line');
  });
  it('picks the hatch inside it, away from any line', () => {
    assert.equal(nearestEntity([hatch, line], { x: 5, y: 8 }, 0.3)?.id, 'hatch');
  });
  it('picks the hatch near its own edge, and nothing outside it', () => {
    assert.equal(nearestEntity([hatch, line], { x: 10.1, y: 8 }, 0.3)?.id, 'hatch');
    assert.equal(nearestEntity([hatch, line], { x: 20, y: 20 }, 0.3), null);
  });
});
