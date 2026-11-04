/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #681: a closed shape made a fill in one action, typed (FILL, FILL red) or from the button on the bar under the selection. The fill
 * is opaque on the screen and in the SVG the DXF walks, a circle over a roof line hides it once brought to front, and an old solid
 * hatch keeps its 0.85.
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
import type { EntityShape } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { submitTypedLine } from './typed-line';
import { ViewSvg } from './view-dxf';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const ROOF: EntityShape = { type: 'line', a: { x: -3, y: 0 }, b: { x: 3, y: 0 } };
const CIRCLE: EntityShape = { type: 'circle', c: { x: 0, y: 0 }, r: 1 };
const hatches = () => draftsOfView('p').flatMap((d) => (d.shape.type === 'hatch' ? [d.shape] : []));

function seed(shape: EntityShape = CIRCLE): string {
  editDrafts({ add: [newDraft('p', '0', ROOF)] });
  const id = editDrafts({ add: [newDraft('p', '0', shape)] })[0];
  clearDraftHistory();
  return id;
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

describe('FILL (#681)', () => {
  it('fills a selected circle white when typed, as one undo step', () => {
    render(<DraftingView view={plan} />);
    const circle = seed();
    act(() => useDraftingSession.setState({ selection: new Set([circle]) }));
    act(() => submitTypedLine('FILL', null));
    assert.equal(hatches().length, 1);
    assert.deepEqual([hatches()[0].opaque, hatches()[0].fill], [true, '#ffffff']);
    act(() => undoLatest());
    assert.equal(hatches().length, 0);
  });

  it('takes a colour, and a second FILL recolours the fill instead of stacking another', () => {
    render(<DraftingView view={plan} />);
    const circle = seed();
    act(() => useDraftingSession.setState({ selection: new Set([circle]) }));
    act(() => submitTypedLine('FILL', null));
    act(() => useDraftingSession.setState({ selection: new Set([circle]) }));
    act(() => submitTypedLine('FILL red', null));
    assert.equal(hatches().length, 1);
    assert.equal(hatches()[0].fill, '#ff0000');
  });

  it('fills from the button on the bar, and a line gets no button', () => {
    const ui = render(<DraftingView view={plan} />);
    const circle = seed();
    act(() => useDraftingSession.setState({ selection: new Set([circle]) }));
    click(ui.querySelector('[role=toolbar] button[aria-label="Fill white"]') as HTMLButtonElement);
    assert.equal(hatches().length, 1);
    const line = draftsOfView('p').find((d) => d.shape.type === 'line')?.id as string;
    act(() => useDraftingSession.setState({ selection: new Set([line]) }));
    assert.equal(ui.querySelector('[role=toolbar] button[aria-label="Fill white"]'), null);
  });

  it('paints the fill opaque in white in the SVG the screen and the DXF walk, after the line it hides', () => {
    render(<DraftingView view={plan} />);
    const circle = seed();
    act(() => useDraftingSession.setState({ selection: new Set([circle]) }));
    act(() => submitTypedLine('FILL', null));
    const ui = render(<ViewSvg view={plan} drawing={null} axis="down" drafts={draftsOfView('p')} layers={useProjectStore.getState().draftLayers} extraPatterns={[]} overlays={[]} />);
    const paths = [...ui.querySelectorAll('path')];
    const fill = paths.find((p) => p.getAttribute('data-dxf-fill') === 'solid');
    assert.equal(fill?.getAttribute('fill'), '#ffffff');
    assert.equal(fill?.getAttribute('fill-opacity'), '1');
    assert.ok(paths.indexOf(fill as SVGPathElement) > 0, 'the fill is painted after the line');
  });

  it('keeps an old solid hatch at 0.85', () => {
    editDrafts({ add: [newDraft('p', '0', { type: 'hatch', loops: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]], pattern: 'SOLID', scale: 1, angle: 0 })] });
    const ui = render(<ViewSvg view={plan} drawing={null} axis="down" drafts={draftsOfView('p')} layers={useProjectStore.getState().draftLayers} extraPatterns={[]} overlays={[]} />);
    assert.equal(ui.querySelector('path[data-dxf-fill=solid]')?.getAttribute('fill-opacity'), '0.85');
  });

  it('refuses a colour it does not know and fills nothing', () => {
    render(<DraftingView view={plan} />);
    const circle = seed();
    act(() => useDraftingSession.setState({ selection: new Set([circle]) }));
    act(() => submitTypedLine('FILL mauve', null));
    assert.equal(hatches().length, 0);
  });
});
