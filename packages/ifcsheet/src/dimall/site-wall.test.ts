/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #642: a wall the plan cuts apart from the building, a site wall round the plot. Its strings used to stand across it, since
 * only the building's own outline was in their way. A site wall along the facade moves them out beyond it; one running out
 * from the facade, which no string could clear within 30 mm on paper, leaves them out and counts them.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { planDimensions } from './plan.js';
import { house, part, rect } from './fixture.js';

const settings = { paperUnit: 0.1, textHeight: 0.25 };
const south = (plan: ReturnType<typeof planDimensions>) => plan.strings.filter((s) => Math.round(s.outward.y) === -1);
const mm = (offset: number) => +(offset / settings.paperUnit).toFixed(6);

describe('strings and a wall apart from the building (#642)', () => {
  it('moves the strings beyond a site wall along the facade, 8 mm clear of it, and stacks the next ones from there', () => {
    // The house's south face is at y = 0; the site wall stands 1.9 to 2.1 m in front of it, where the first string would stand.
    const plan = planDimensions([...house(), part('wall', rect(-6, -2.1, 18, -1.9))], settings);
    assert.deepEqual(south(plan).map((s) => s.kind), ['inner', 'middle', 'overall']);
    assert.deepEqual(south(plan).map((s) => mm(s.offset)), [29, 37, 45]);
    assert.equal(plan.droppedStrings, 0);
  });

  it('leaves the strings out and counts them when the wall in their way runs out from the facade', () => {
    const alone = planDimensions(house(), settings);
    const plan = planDimensions([...house(), part('wall', rect(4.9, -12, 5.1, -1))], settings);
    assert.equal(south(plan).length, 0);
    assert.equal(plan.droppedStrings, alone.droppedStrings + 3);
    // The other facades keep their strings where they were.
    assert.deepEqual(plan.strings.map((s) => [s.key, s.offset]), alone.strings.filter((s) => Math.round(s.outward.y) !== -1).map((s) => [s.key, s.offset]));
  });

  it('lets a string end on a wall it meets at an inner corner, up to its finish coat', () => {
    // A site wall running south past the house's south-west corner, its face 12 mm proud of the house's west face: the south strings start on it.
    const alone = planDimensions(house(), settings);
    const plan = planDimensions([...house(), part('wall', rect(-0.3, -6, 0.012, -0.5))], settings);
    assert.deepEqual(south(plan).map((s) => mm(s.offset)), south(alone).map((s) => mm(s.offset)));
    assert.equal(plan.droppedStrings, alone.droppedStrings);
  });
});
