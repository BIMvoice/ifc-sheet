/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Annotation types: what applying one sets, what capturing one keeps, and which tool a shape belongs to. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftSettings } from '@/drafting/commands/types';
import { toolOfShape } from '@/drafting/commands/annotate';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { captureType, typeEffect } from './annotation-types.js';
import type { AnnotationType } from './types.js';

const book = {
  textStyles: [{ ...DEFAULT_TEXT_STYLE }, { ...DEFAULT_TEXT_STYLE, id: 'big', name: 'Big', height: 5 }],
  dimStyles: [{ ...DEFAULT_DIM_STYLE }, { ...DEFAULT_DIM_STYLE, id: 'arch', name: 'Arch', textStyle: 'big' }],
};
const layers = [{ id: '0', name: '0', color: '#000', visible: true, locked: false }, { id: 'l1', name: 'Notes', color: '#000', visible: true, locked: false }];
const now = { textStyle: 'standard', dimStyle: 'standard' };

describe('annotation type effect', () => {
  it('sets the style, text height, layer and the tool\'s own options', () => {
    const axis: AnnotationType = { id: 'a', name: 'Grid', tool: 'axis', textStyle: 'big', layer: 'l1', axis: { bubble: 'square', ends: 'none', size: 0.9, lineType: 'dotted' } };
    const e = typeEffect(axis, book, layers, now);
    assert.deepEqual([e.textStyle, e.textHeightMm, e.layer], ['big', 5, 'l1']);
    assert.deepEqual(e.settings, { annotationType: { id: 'a', tool: 'axis' }, axisBubble: 'square', axisEnds: 'none', axisSize: 0.9, axisLineType: 'dotted' });
    const hatch = typeEffect({ id: 'h', name: 'H', tool: 'hatch', hatch: { pattern: 'BRICK', scale: 2, angle: 30 } }, book, layers, now);
    assert.deepEqual([hatch.settings.hatchPattern, hatch.settings.hatchScale, hatch.settings.hatchAngle], ['BRICK', 2, 30]);
    assert.equal(typeEffect({ id: 't', name: 'T', tool: 'tag', tagField: 'class' }, book, layers, now).settings.tagField, 'class');
  });

  it('a dimension type takes its text from the dimension style', () => {
    const e = typeEffect({ id: 'd', name: 'D', tool: 'dimaligned', dimStyle: 'arch', textStyle: 'standard' }, book, layers, now);
    assert.deepEqual([e.dimStyle, e.textStyle, e.textHeightMm], ['arch', 'big', 5]);
  });

  it('names missing from this project fall back to what is in force', () => {
    const e = typeEffect({ id: 'x', name: 'X', tool: 'leader', textStyle: 'gone', layer: 'gone' }, book, layers, { textStyle: 'big', dimStyle: 'standard' });
    assert.deepEqual([e.textStyle, e.layer], ['big', undefined]);
  });
});

describe('capturing a type', () => {
  const settings = {
    currentTextStyle: 'big', currentDimStyle: 'arch', axisBubble: 'square', axisEnds: 'start', axisSize: null, axisLineType: 'dashed',
    hatchPattern: 'BRICK', hatchScale: 2, hatchAngle: 15, tagField: 'name',
  } as unknown as DraftSettings;

  it('keeps only what the tool uses', () => {
    assert.deepEqual(captureType('1', 'Axis', 'axis', settings, 'l1'), { id: '1', name: 'Axis', tool: 'axis', layer: 'l1', textStyle: 'big', axis: { bubble: 'square', ends: 'start', size: null, lineType: 'dashed' } });
    assert.deepEqual(captureType('2', 'Dim', 'dimlinear', settings, '0'), { id: '2', name: 'Dim', tool: 'dimlinear', layer: '0', dimStyle: 'arch' });
    assert.equal(captureType('3', 'Tag', 'tag', settings, '0').tagField, 'name');
  });

  it('a captured type applies back to the settings it came from', () => {
    const e = typeEffect(captureType('1', 'Hatch', 'hatch', settings, 'l1'), book, layers, now);
    assert.deepEqual([e.settings.hatchPattern, e.settings.hatchScale, e.settings.hatchAngle, e.layer], ['BRICK', 2, 15, 'l1']);
  });
});

describe('the tool of a shape', () => {
  it('maps every annotation shape to its drafting command', () => {
    const p = { x: 0, y: 0 };
    assert.equal(toolOfShape({ type: 'dimension', variant: 'linear', a: p, b: p, at: p, height: 1 }), 'dimlinear');
    assert.equal(toolOfShape({ type: 'dimension', variant: 'aligned', a: p, b: p, at: p, height: 1 }), 'dimaligned');
    assert.equal(toolOfShape({ type: 'radial', c: p, r: 1, at: p, diameter: true, height: 1 }), 'dimdiameter');
    assert.equal(toolOfShape({ type: 'radial', c: p, r: 1, at: p, diameter: false, height: 1 }), 'dimradius');
    assert.equal(toolOfShape({ type: 'level', p, value: 0, height: 1 }), 'level');
  });
});
