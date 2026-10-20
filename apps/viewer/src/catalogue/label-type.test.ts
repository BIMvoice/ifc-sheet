/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A label annotation type: its template, frame and placeholder are read back, and a damaged one is repaired or refused by the path. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captureType } from './annotation-types.js';
import { readAnnotationType } from './readers.js';
import { DEFAULT_LABEL } from './types.js';

const base = { id: 'a', name: 'L', tool: 'label' };

describe('label annotation type', () => {
  it('reads template, frame and placeholder', () => {
    const t = readAnnotationType({ ...base, label: { template: '{Name}', frame: 'box', missing: 'empty' } }, '/t');
    assert.deepEqual(t.label, { template: '{Name}', frame: 'box', missing: 'empty' });
  });
  it('defaults the placeholder and drops an unknown frame', () => {
    const t = readAnnotationType({ ...base, label: { template: 'x', frame: 'hexagon', missing: 'sometimes' } }, '/t');
    assert.deepEqual(t.label, { template: 'x', missing: DEFAULT_LABEL.missing });
  });
  it('has no label when none is stored (an older type) and refuses nothing', () => {
    assert.equal(readAnnotationType({ ...base }, '/t').label, undefined);
    assert.equal(readAnnotationType({ ...base, label: { frame: 'box' } }, '/t').label, undefined);
  });
  it('is captured with the default label', () => {
    const type = captureType('a', 'L', 'label', { currentTextStyle: 'standard', currentDimStyle: 'standard' } as never, '0');
    assert.deepEqual(type.label, DEFAULT_LABEL);
    assert.notEqual(type.label, DEFAULT_LABEL, 'a copy, so editing the type does not edit the default');
  });
});
