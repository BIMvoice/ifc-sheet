/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AnnotationShape } from '@/drafting/types';
import { annotationAtFactor, annotationFactor, viewportPaperUnit } from './viewport-annotation.js';

const text: AnnotationShape = { type: 'text', p: { x: 1, y: 1 }, text: 'Kitchen', height: 0.125, rotation: 0 };

describe('annotation size on a sheet', () => {
  it('a view drawn at 1:50 and shown at 1:100 doubles the stored size, so it still prints 2.5 mm', () => {
    const factor = annotationFactor(100, 50);
    const shown = annotationAtFactor(text, factor);
    assert.equal(shown.type === 'text' && (shown.height * 1000) / 100, 2.5);
  });

  it('shown at the scale it was drawn at, nothing changes', () => {
    assert.equal(annotationAtFactor(text, annotationFactor(50, 50)), text);
  });

  it('a view without a scale counts as 1:100', () => {
    assert.equal(annotationFactor(50, undefined), 0.5);
  });

  it('the axis bubble follows the text, geometry does not', () => {
    const axis: AnnotationShape = { type: 'axis', a: { x: 0, y: 0 }, b: { x: 0, y: 9 }, label: '1', bubble: 'circle', ends: 'both', size: 0.4, height: 0.1, lineType: 'dashdot' };
    const shown = annotationAtFactor(axis, 2);
    assert.ok(shown.type === 'axis' && shown.size === 0.8 && shown.height === 0.2);
    assert.deepEqual(shown.type === 'axis' && shown.b, { x: 0, y: 9 });
  });

  it('hatches are left alone', () => {
    const hatch: AnnotationShape = { type: 'hatch', loops: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]], pattern: 'ANSI31', scale: 1, angle: 0 };
    assert.equal(annotationAtFactor(hatch, 2), hatch);
  });

  it('style millimetres convert with the viewport scale: 1 mm is 0.1 m at 1:100', () => {
    assert.equal(viewportPaperUnit(100), 0.1);
  });
});
