/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The schedule's unconfigured rows take the mark the plan shows. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftEntity } from '@/drafting/types';
import { drawnCodes, withDrawnMarks } from './drawn-marks.js';
import type { ScheduleEntry } from './schedule-data.js';

const label = (guid: string, code: string): DraftEntity => ({ id: guid, viewId: 'v', layerId: 'l', shape: { type: 'text', p: { x: 0, y: 0 }, text: code, height: 0.25, rotation: 0 }, params: { labelOf: guid, markCode: code } }) as unknown as DraftEntity;
const row = (over: Partial<ScheduleEntry>): ScheduleEntry => ({ key: 'k', kind: 'window', spec: null, mark: '—', name: 'Window', width: 1, height: 1, counts: {}, total: 2, occurrences: [{ modelId: 'm', expressId: 1, globalId: 'a', level: 'L', tag: null, number: 1 }, { modelId: 'm', expressId: 2, globalId: 'b', level: 'L', tag: null, number: 2 }], ...over });

describe('drawn marks in the schedule', () => {
  it('a row without a configured type takes the code its occurrences carry on the plan', () => {
    const out = withDrawnMarks([row({})], drawnCodes([label('a', 'W2'), label('b', 'W2')]));
    assert.equal(out[0].mark, 'W2');
  });
  it('a row that spans two kinds lists both, and a row with nothing drawn is left alone', () => {
    assert.equal(withDrawnMarks([row({})], drawnCodes([label('a', 'W2'), label('b', 'W1')]))[0].mark, 'W1/W2');
    assert.equal(withDrawnMarks([row({})], new Map())[0].mark, '—');
  });
});
