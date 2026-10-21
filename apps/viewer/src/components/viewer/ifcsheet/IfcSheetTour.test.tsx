/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, useRef, useState } from 'react';
import { cleanup, click, press, render, waitFor } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { submitCommandLine, useDraftingSession } from '@/drafting/session';
import { abortTour } from '@/lib/tours/controller';
import { resetTourState, useTourStore } from '@/lib/tours/tour-store';
import { TourHost } from '@/components/tours/TourHost.js';
import { useDraftingKeys } from '../drafting/useDraftingKeys.js';
import { getTour } from '@/lib/tours/registry';
import { TourStepCard } from '@/components/tours/TourStepCard.js';
import { SteppedSheet } from '../wall/SteppedSheet.js';
import { WallIntro } from '../wall/WallIntro.js';
import { IfcSheetShell } from './IfcSheetShell.js';
import { IFCSHEET_TOUR_SEEN } from './useIfcSheetTour.js';

/**
 * The IfcSheet tour as a user meets it: shown on the first run, remembered
 * once dismissed, reopened from the header, harmless without storage, closed
 * by Esc, and deaf to the drafting keys while it has focus.
 */

const initial = useViewerStore.getState();
const STORAGE_KEY = 'ifc-lite:tours:v1';
const seen = (): boolean => Boolean((JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{"notices":{}}') as { notices?: Record<string, string> }).notices?.[IFCSHEET_TOUR_SEEN]);
const card = (): HTMLElement | null => document.querySelector('[role="dialog"]');
const running = (): boolean => useTourStore.getState().status === 'running';

function Wall() {
  return <><IfcSheetShell /><TourHost /></>;
}

beforeEach(() => {
  window.localStorage.clear();
  resetProject();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
});
afterEach(() => {
  act(() => { abortTour('close'); });
  cleanup();
  resetTourState();
  useViewerStore.setState(initial);
  window.localStorage.clear();
});

describe('IfcSheet tour: first run, seen, help button', () => {
  it('shows on the first run, stores "seen" when dismissed, and the help button reopens it', async () => {
    render(<Wall />);
    await waitFor(() => card() !== null, 'the tour shows on the first run');
    assert.match(card()?.textContent ?? '', /Open a model/);
    assert.equal(seen(), false, 'not seen while it is showing');

    const end = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'End tour');
    assert.ok(end, 'a way to dismiss it');
    click(end);
    await waitFor(() => !running(), 'dismissing ends the tour');
    assert.equal(seen(), true, 'dismissing stores "seen"');
    cleanup();

    // A later run does not show it.
    render(<Wall />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    assert.equal(running(), false);
    assert.equal(card(), null);

    // The help button in the header brings it back.
    const help = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Show the tour of the Wall');
    assert.ok(help, 'the header has a help button');
    click(help);
    await waitFor(() => card() !== null, 'the help button reopens the tour');
  });

  it('does not break the app when storage throws', async () => {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage;
    const { getItem, setItem } = proto;
    proto.getItem = () => { throw new Error('storage blocked'); };
    proto.setItem = () => { throw new Error('storage blocked'); };
    try {
      render(<Wall />);
      await waitFor(() => card() !== null, 'the tour still shows without storage');
      const end = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'End tour');
      assert.ok(end);
      click(end);
      await waitFor(() => !running(), 'and can be dismissed');
    } finally {
      proto.getItem = getItem;
      proto.setItem = setItem;
    }
  });
});

/** The drafting view's key handler with the command line, as DraftingView mounts it. */
function Keys() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  useDraftingKeys({ inputRef, setText, submit: () => { submitCommandLine(text, null); setText(''); } });
  return <input ref={inputRef} aria-label="command line" value={text} readOnly />;
}

describe('IfcSheet tour: keys', () => {
  it('Esc with the tour focused closes it', async () => {
    render(<Wall />);
    await waitFor(() => card() !== null, 'the tour shows');
    const c = card();
    assert.ok(c);
    c.focus();
    press(c, 'Escape');
    await waitFor(() => !running(), 'Esc ends the tour');
  });

  it('typing LINE and Enter at the tour starts no drafting command; the same keys elsewhere do', async () => {
    const viewId = useProjectStore.getState().views.find((v) => v.kind === 'plan')?.id ?? '';
    act(() => { useDraftingSession.setState({ viewId }); });
    render(<><Keys /><Wall /></>);
    await waitFor(() => card() !== null, 'the tour shows');
    const c = card();
    assert.ok(c);
    assert.equal(c.hasAttribute('data-owns-keys'), true);
    for (const key of ['l', 'i', 'n', 'e', 'Enter']) press(c, key);
    assert.equal(useDraftingSession.getState().commandId, null, 'nothing started while the tour has focus');
    assert.equal(document.querySelector<HTMLInputElement>('input[aria-label="command line"]')?.value, '', 'nothing reached the command line');

    // Control: the keys do start LINE from the page, so the check above can fail.
    for (const key of ['l', 'i', 'n', 'e', 'Enter']) press(document.body, key);
    assert.equal(useDraftingSession.getState().commandId, 'line');
    act(() => { useDraftingSession.setState({ viewId: null, commandId: null }); });
  });
});

describe('IfcSheet tour: the Wall keys leave the card alone', () => {
  const HOUSE = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
  /** The tour's card over another surface, focused as it is when a step shows. */
  const tourCard = () => {
    const tour = getTour('ifcsheet');
    assert.ok(tour);
    return <TourStepCard tour={tour} step={tour.steps[0]} stepIndex={0} targetEl={null} />;
  };

  it('Esc on the card does not also let go of what the sheet holds (the sheet listens first, in capture)', () => {
    const sheet = useProjectStore.getState().sheets[0];
    assert.ok(sheet, 'a sheet to step into');
    let backs = 0;
    const ui = render(<><SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} onBack={() => { backs += 1; }} onStep={() => {}} />{tourCard()}</>);
    const adding = () => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add a drawing')?.getAttribute('aria-pressed');
    click([...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add a drawing')!);
    assert.equal(adding(), 'true', 'the chooser is open');
    const c = card();
    assert.ok(c);
    press(c, 'Escape');
    assert.equal(adding(), 'true', 'the chooser stays open');

    // Control: Esc from the page closes it, so the check above can fail. Neither leaves the sheet (#142).
    press(document.body, 'Escape');
    assert.equal(adding(), 'false');
    assert.equal(backs, 0);
  });

  it('Enter on the card does not hang the set from the intro', () => {
    let hung = 0;
    render(<><WallIntro modelName="House" extent={HOUSE} onHang={() => { hung += 1; }} />{tourCard()}</>);
    const c = card();
    assert.ok(c);
    press(c, 'Enter');
    assert.equal(hung, 0, 'the intro stays');

    // Control: Enter from the page hangs it.
    press(document.body, 'Enter');
    assert.equal(hung, 1);
  });
});
