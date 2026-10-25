/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pen of one drawing item (#32): the one function the canvas and the sheet's pens both read. An element's own graphics are the
 * most specific word, over its phase's, over (what the callers keep) its category's; the weight words mean what the graphic standard
 * says.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveElementGraphics, type ViewGraphics } from '@bimvoice/ifcsheet';
import { ROMANIAN_PRACTICE } from '@/drafting/graphic-standard';
import { itemPen } from './item-pen';

const GID = '2O2Fr$t4X7Zf8NOew3FLOH';
const itemOf = (graphics: ViewGraphics, extra: object = {}) => ({ ifcType: 'IfcWall', elementStyle: resolveElementGraphics(graphics, GID, 'IfcWall') ?? undefined, ...extra });

describe('itemPen', () => {
  it('is nothing for an item with no phase and no element graphics: the callers keep the category\'s', () => {
    assert.equal(itemPen(undefined, { ifcType: 'IfcWall' }), null);
  });

  it('the element\'s colour, dash and fill; the weight is the cut weight for a face\'s outline and a cut line, the projection weight for a line seen beyond', () => {
    const g: ViewGraphics = { elements: { [GID]: { lineColor: '#808080', fillColor: '#101010', lineStyle: 'dashed', cutWeight: 'heavy', projectionWeight: 'hairline' } } };
    assert.deepEqual(itemPen(g, itemOf(g)), { color: '#808080', fill: '#101010', dash: [3, 1.5], mm: 0.7 });
    assert.equal(itemPen(g, itemOf(g, { category: 'cut' }))?.mm, 0.7);
    assert.equal(itemPen(g, itemOf(g, { category: 'projection' }))?.mm, 0.065);
  });

  it('a weight word means what the graphic standard says', () => {
    const g: ViewGraphics = { elements: { [GID]: { cutWeight: 'light' } } };
    assert.equal(itemPen(g, itemOf(g))?.mm, 0.25, 'the default standard');
    assert.equal(itemPen(g, itemOf(g), ROMANIAN_PRACTICE.weights)?.mm, 0.35, 'Romanian practice');
  });

  it('a field the element leaves out is not decided here', () => {
    const g: ViewGraphics = { elements: { [GID]: { lineStyle: 'solid' } } };
    assert.deepEqual(itemPen(g, itemOf(g)), { dash: [] });
  });

  it('the element beats the phase, field by field; the phase keeps what the element leaves out', () => {
    const g: ViewGraphics = { phases: { show: ['demolish'] }, elements: { [GID]: { lineColor: '#00ff00', lineStyle: 'solid' } } };
    const pen = itemPen(g, itemOf(g, { phase: 'demolish' }))!;
    assert.equal(pen.color, '#00ff00', 'the element\'s colour');
    assert.deepEqual(pen.dash, [], 'solid, though the phase is dashed');
    assert.ok(pen.fill && pen.fill !== '#00ff00', 'the phase\'s fill');
    assert.ok(typeof pen.mm === 'number', 'the phase\'s pen');
  });

  it('with a phase, the category\'s own colour (already in the element\'s style) does not hide the phase\'s: only what the element itself says goes over it', () => {
    const g: ViewGraphics = { phases: { show: ['demolish'] }, categories: { walls: { lineColor: '#0000cc' } }, elements: { [GID]: { lineStyle: 'dashed' } } };
    const pen = itemPen(g, itemOf(g, { phase: 'demolish' }))!;
    assert.notEqual(pen.color, '#0000cc', 'a phase draws over its category');
  });
});
