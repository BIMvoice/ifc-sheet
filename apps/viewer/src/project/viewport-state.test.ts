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
    assert.deepEqual(viewportState(undefined), { kind: 'idle' });
    assert.deepEqual(viewportState(EMPTY_VIEW_DRAWING), { kind: 'idle' });
  });

  it('is indeterminate while the generator has reported nothing, and invents no percentage', () => {
    assert.deepEqual(viewportState(entry({ status: 'generating' })), { kind: 'generating', percent: null, phase: '' });
  });

  it('carries the progress and phase the generator reported', () => {
    assert.deepEqual(viewportState(entry({ status: 'generating', progress: 41.6, phase: 'Cutting' })), { kind: 'generating', percent: 42, phase: 'Cutting' });
    assert.deepEqual(viewportState(entry({ status: 'generating', progress: 250, phase: 'x' })), { kind: 'generating', percent: 100, phase: 'x' });
  });

  it('is failed with the generator\'s own reason', () => {
    assert.deepEqual(viewportState(entry({ status: 'error', error: 'level not found' })), { kind: 'failed', reason: 'level not found' });
    assert.deepEqual(viewportState(entry({ status: 'error', error: null })), { kind: 'failed', reason: '' });
  });

  it('is emptyCut when the drawing is ready and holds nothing at all', () => {
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({}) })), { kind: 'emptyCut' });
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: null })), { kind: 'emptyCut' });
  });

  it('is ready when anything was cut or projected', () => {
    const poly = {} as Drawing2D['cutPolygons'][number];
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({ lines: [{} as Drawing2D['lines'][number]] }) })), { kind: 'ready' });
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({ cutPolygons: [poly] }) })), { kind: 'ready' });
    assert.deepEqual(viewportState(entry({ status: 'ready', drawing: drawing({ projectionPolygons: [poly] }) })), { kind: 'ready' });
  });
});
