/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { EMPTY_VIEW_DRAWING, type ViewDrawingEntry } from './view-drawings.js';
import { viewportState } from './viewport-state.js';

const entry = (patch: Partial<ViewDrawingEntry>): ViewDrawingEntry => ({ ...EMPTY_VIEW_DRAWING, ...patch });
const drawing = (parts: Partial<Pick<Drawing2D, 'lines' | 'cutPolygons' | 'projectionPolygons'>>): Drawing2D =>
  ({ lines: [], cutPolygons: [], projectionPolygons: [], ...parts }) as unknown as Drawing2D;

describe('viewportState', () => {
  it('says nothing before a drawing is asked for', () => {
    assert.deepEqual(viewportState(undefined, 'plan'), { kind: 'idle' });
    assert.deepEqual(viewportState(EMPTY_VIEW_DRAWING, 'plan'), { kind: 'idle' });
  });

  it('is indeterminate while the generator has reported nothing, and invents no percentage', () => {
    assert.deepEqual(viewportState(entry({ status: 'generating' }), 'plan'), { kind: 'generating', percent: null, phase: '' });
  });

  it('carries the progress and phase the generator reported', () => {
    assert.deepEqual(viewportState(entry({ status: 'generating', progress: 41.6, phase: 'Cutting' }), 'plan'), { kind: 'generating', percent: 42, phase: 'Cutting' });
    assert.deepEqual(viewportState(entry({ status: 'generating', progress: 250, phase: 'x' }), 'plan'), { kind: 'generating', percent: 100, phase: 'x' });
  });

  it('is failed with the generator\'s own reason', () => {
    assert.deepEqual(viewportState(entry({ status: 'error', error: 'level not found' }), 'plan'), { kind: 'failed', reason: 'level not found' });
    assert.deepEqual(viewportState(entry({ status: 'error', error: null }), 'plan'), { kind: 'failed', reason: '' });
  });

  it('is emptyCut on a plan when the drawing is ready and holds nothing at all', () => {
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({}) }), 'plan'), { kind: 'emptyCut' });
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: null }), 'plan'), { kind: 'emptyCut' });
  });

  // PR #107 review: an elevation or a section has no cut height, so its empty
  // drawing must not say "Nothing is cut at this height".
  for (const kind of ['elevation', 'section'] as const) {
    it(`is emptyView, not emptyCut, on an empty ${kind}`, () => {
      assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({}) }), kind), { kind: 'emptyView' });
      assert.deepEqual(viewportState(entry({ status: 'ready', drawing: null }), kind), { kind: 'emptyView' });
    });
  }

  it('is ready when anything was cut or projected', () => {
    const poly = {} as Drawing2D['cutPolygons'][number];
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({ lines: [{} as Drawing2D['lines'][number]] }) }), 'plan'), { kind: 'ready' });
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({ cutPolygons: [poly] }) }), 'plan'), { kind: 'ready' });
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({ projectionPolygons: [poly] }) }), 'plan'), { kind: 'ready' });
  });
});
