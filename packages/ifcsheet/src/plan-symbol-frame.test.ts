/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An IfcMappedItem's MappingTarget read the way IFC4 IfcBaseAxis defines its axes (#508): a 2D operator with only an Axis2,
 * and a mirrored 3D operator with no Axis3.
 */

import { IfcParser } from '@ifc-lite/parser';
import { describe, expect, it } from 'vitest';
import { planSymbolIfc } from './__fixtures__/plan-symbol-model.js';
import { operatorFrame, type Xf } from './plan-symbol-frame.js';

/** The fixture with extra rows; operator `#900` is read on its own. */
async function frameOf(rows: string[]): Promise<Xf> {
  const text = planSymbolIfc().replace('#87=', `${rows.join('\n')}\n#87=`);
  const store = await new IfcParser().parseColumnar(new TextEncoder().encode(text).buffer as ArrayBuffer);
  const m = operatorFrame(store, 900);
  expect(m).not.toBeNull();
  return m!;
}
const col = (m: Xf, c: number) => [m[c], m[4 + c], m[8 + c]];
const det3 = (m: Xf) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
const near = (v: number[], w: number[]) => v.forEach((n, i) => expect(n).toBeCloseTo(w[i], 9));

describe('the axes of a MappingTarget (IfcBaseAxis, #508)', () => {
  it('a 2D operator with Axis2 (0, -1) and no Axis1 turns a half turn, not a mirror', async () => {
    const m = await frameOf(['#901=IFCDIRECTION((0.,-1.));', '#902=IFCCARTESIANPOINT((0.,0.));', '#900=IFCCARTESIANTRANSFORMATIONOPERATOR2D($,#901,#902,$);']);
    near(col(m, 0), [-1, 0, 0]);
    near(col(m, 1), [0, -1, 0]);
    expect(det3(m)).toBeCloseTo(1, 9);
  });

  it('a 2D operator with Axis2 (-1, 0) and no Axis1 turns a quarter turn, not a collapsed frame', async () => {
    const m = await frameOf(['#901=IFCDIRECTION((-1.,0.));', '#902=IFCCARTESIANPOINT((0.,0.));', '#900=IFCCARTESIANTRANSFORMATIONOPERATOR2D($,#901,#902,$);']);
    near(col(m, 0), [0, 1, 0]);
    near(col(m, 1), [-1, 0, 0]);
    expect(det3(m)).toBeCloseTo(1, 9);
  });

  it('a mirrored 3D operator with no Axis3 keeps z = (0, 0, 1) and projects x and y onto the plane', async () => {
    const m = await frameOf([
      '#901=IFCDIRECTION((1.,0.,1.));', '#903=IFCDIRECTION((0.,-1.,1.));',
      '#900=IFCCARTESIANTRANSFORMATIONOPERATOR3D(#901,#903,#10,1.,$);',
    ]);
    near(col(m, 0), [1, 0, 0]);
    near(col(m, 1), [0, -1, 0]);
    near(col(m, 2), [0, 0, 1]);
    expect(det3(m)).toBeCloseTo(-1, 9);
  });
});
