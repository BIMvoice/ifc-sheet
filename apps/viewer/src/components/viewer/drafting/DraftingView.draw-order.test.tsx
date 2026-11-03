/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #682: what draws on top among the drafted elements. A hatch is above a line when it is stored after it, whatever the kind; "Bring to
 * front" and "Send to back" (typed, and the buttons on the bar under the selection) move the selection; a layer's order stands above
 * the stored order; and the screen and the DXF draw one order.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, draftsOfView, editDrafts, newDraft } from '@/drafting/draft-store';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import { undoLatest } from '@/project/unified-undo';
import type { DraftLayer, EntityShape } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { submitTypedLine } from './typed-line';
import { ViewSvg } from './view-dxf';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const LINE: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 4 } };
const HATCH: EntityShape = { type: 'hatch', loops: [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]], pattern: 'SOLID', scale: 1, angle: 0 };
const kinds = (): string[] => draftsOfView('p').map((d) => d.shape.type);
const layer = (id: string, order?: number): DraftLayer => ({ id, name: id, color: '#000000', visible: true, locked: false, ...(order === undefined ? {} : { order }) });

/** A line, then a hatch over it; the hatch selected. */
function seed(layers: DraftLayer[] = [layer('0')], hatchLayer = '0'): { line: string; hatch: string } {
  useProjectStore.setState({ draftLayers: layers });
  const [line, hatch] = [editDrafts({ add: [newDraft('p', '0', LINE)] })[0], editDrafts({ add: [newDraft('p', hatchLayer, HATCH)] })[0]];
  clearDraftHistory();
  return { line, hatch };
}

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
});

describe('Bring to front and Send to back (#682)', () => {
  it('bring the selection above everything else drafted, typed, in one undo step', () => {
    render(<DraftingView view={plan} />);
    const { line } = seed();
    act(() => useDraftingSession.setState({ selection: new Set([line]) }));
    assert.deepEqual(kinds(), ['line', 'hatch']);
    act(() => submitTypedLine('BRINGTOFRONT', null));
    assert.deepEqual(kinds(), ['hatch', 'line']);
    act(() => undoLatest());
    assert.deepEqual(kinds(), ['line', 'hatch']);
  });

  it('send the selection under everything else, from the button on the bar', () => {
    const ui = render(<DraftingView view={plan} />);
    const { hatch } = seed();
    act(() => useDraftingSession.setState({ selection: new Set([hatch]) }));
    click(ui.querySelector('[role=toolbar] button[aria-label="Send to back"]') as HTMLButtonElement);
    assert.deepEqual(kinds(), ['hatch', 'line']);
  });

  it('put a hatch under a line and over it again on the screen: the DOM is painted in that order', () => {
    const ui = render(<DraftingView view={plan} />);
    const { hatch } = seed();
    // What the overlay paints, bottom to top: the solid hatch is the path tagged for the DXF, the line the stroked one.
    const painted = (): string[] => [...ui.querySelectorAll('svg path')].flatMap((p) => (p.getAttribute('data-dxf-fill') === 'solid' ? ['hatch'] : p.getAttribute('stroke') !== null && p.getAttribute('fill') === 'none' && p.getAttribute('d')?.includes('L') ? ['line'] : []));
    act(() => useDraftingSession.setState({ selection: new Set([hatch]) }));
    act(() => submitTypedLine('SENDTOBACK', null));
    act(() => useDraftingSession.setState({ selection: new Set() }));
    assert.deepEqual(painted(), ['hatch', 'line']);
    act(() => useDraftingSession.setState({ selection: new Set([hatch]) }));
    act(() => submitTypedLine('BRINGTOFRONT', null));
    act(() => useDraftingSession.setState({ selection: new Set() }));
    assert.deepEqual(painted(), ['line', 'hatch']);
  });
});

describe('a layer\'s order (#682)', () => {
  it('puts a layer above another whatever was drawn last', () => {
    seed([layer('0'), layer('fills', -1)], 'fills');
    assert.deepEqual(kinds(), ['hatch', 'line']);
    useProjectStore.setState({ draftLayers: [layer('0'), layer('fills', 1)] });
    assert.deepEqual(kinds(), ['line', 'hatch']);
  });

  it('is the order of the DXF too: the walker writes the view\'s SVG in document order, and the hatch of a layer ordered below comes before the line', () => {
    const order = (layers: DraftLayer[]): string[] => {
      const drafts = [newDraft('p', '0', LINE), newDraft('p', 'fills', HATCH)];
      const ui = render(<ViewSvg view={plan as ProjectView} drawing={null} axis="down" drafts={drafts} layers={layers} extraPatterns={[]} overlays={[]} />);
      return [...ui.querySelectorAll('path')].map((p) => (p.getAttribute('data-dxf-fill') === 'solid' ? 'HATCH' : 'LINE'));
    };
    assert.deepEqual(order([layer('0'), layer('fills')]), ['LINE', 'HATCH']);
    assert.deepEqual(order([layer('0'), layer('fills', -1)]), ['HATCH', 'LINE']);
  });
});
