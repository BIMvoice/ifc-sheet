/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafted text of two lines (#673) prints as two lines on the sheet and in the PDF of `ifcsheet build`: one label per line, from the
 * same left edge, one line pitch (`LINE_PITCH` text heights) under the one before, the lines of the app's own screen.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ProjectView, SheetViewport } from './document.js';
import type { DraftEntity } from './draft-types.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';
import { LINE_PITCH } from './text-block.js';

vi.mock('./site-frame.js', async (original) => ({ ...(await original<typeof import('./site-frame.js')>()), siteFrameOf: () => ({ north: null, frameOffset: { x: 0, y: 0, z: 0 } }) }));

describe('a two-line text on the sheet (#673)', () => {
  const view = { id: 'v', name: 'Plan', kind: 'plan', createdAt: 0 } as ProjectView;
  const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
  const text: DraftEntity = { id: 't', viewId: 'v', layerId: '0', shape: { type: 'text', p: { x: 10, y: 0 }, text: 'Kitchen\nEI 60', height: 0.25, rotation: 0 }, params: {} } as DraftEntity;
  const annotations = { drafts: [text], layers: [{ id: '0', name: '0', color: '#000000', visible: true, locked: false }], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' } as unknown as SheetAnnotations;

  it('is one label per line, a line pitch apart, from the same left edge', () => {
    const { texts } = viewportAnnotations({ view, vp, at: (p) => ({ x: 100 + p.x, y: 100 - p.y }), frame: { kx: 1, ky: -1 }, box: null }, annotations);
    expect(texts.map((t) => t.text)).toEqual(['Kitchen', 'EI 60']);
    expect(texts[1].at.x).toBeCloseTo(texts[0].at.x, 9);
    expect(texts[1].at.y - texts[0].at.y).toBeCloseTo(LINE_PITCH * texts[0].size, 9);
  });
});
