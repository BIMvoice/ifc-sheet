/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #863: two IFC files given to the start page together (an architectural and a structural model) open as one
 * set. Since the start page (#853) a drop or a pick of two files opened only the first: its picker took one
 * file and its drop handler kept the drop from the window's handler, which had opened them all. The page now
 * hands every IFC file to the viewport's router through `ifc-lite:load-files`, and that router opens them
 * together.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { EVENT_LOAD_FILE } from '@/lib/tours/events';
import { useViewerStore } from '@/store';
import { resetProject } from '@/project/project-store';
import { armTemplate } from '@/set-template/store';
import { EVENT_LOAD_FILES } from '../open-model-files-event';
import { useOpenModelFiles } from '../useOpenModelFiles';
import { WallView } from './WallView';

const file = (name: string): File => new File(['x'], name);
const page = (): HTMLElement => document.querySelector('[data-testid="wall-start"]') as HTMLElement;
const picker = (): HTMLInputElement => page().querySelector('[data-testid="wall-start-drop"] input[type="file"]') as HTMLInputElement;

// happy-dom's DragEvent ignores `dataTransfer` in its init, so the event is handed what a browser gives it.
function drop(target: EventTarget, ...files: File[]): Event {
  const event = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files } });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function pick(input: HTMLInputElement, ...files: File[]): void {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  act(() => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
}

let single: File[] = [];
let sets: File[][] = [];
const onSingle = (e: Event): void => { single.push((e as CustomEvent<File>).detail); };
const onSet = (e: Event): void => { sets.push((e as CustomEvent<File[]>).detail); };

beforeEach(() => {
  resetProject();
  armTemplate(null);
  useViewerStore.setState({ models: new Map() });
  single = [];
  sets = [];
  window.addEventListener(EVENT_LOAD_FILE, onSingle);
  window.addEventListener(EVENT_LOAD_FILES, onSet);
});
afterEach(() => {
  window.removeEventListener(EVENT_LOAD_FILE, onSingle);
  window.removeEventListener(EVENT_LOAD_FILES, onSet);
  cleanup();
});

describe('the start page opens several IFC files as one set (#863)', () => {
  it('opens both of two IFC files dropped together, and still keeps the browser on the page', () => {
    render(<WallView />);
    const arc = file('ARC.ifc');
    const str = file('STR.ifc');
    assert.equal(drop(page(), arc, str).defaultPrevented, true);
    assert.deepEqual(sets, [[arc, str]], 'both files go to the router together');
    assert.deepEqual(single, [], 'not the first one alone');
    assert.equal(document.querySelector('[role="alert"]'), null);
  });

  it('lets the picker choose several files and opens every IFC among them', () => {
    render(<WallView />);
    const input = picker();
    assert.equal(input.multiple, true, 'the browser offers to choose more than one file');
    const arc = file('ARC.ifc');
    const str = file('STR.IFC');
    pick(input, arc, file('notes.pdf'), str);
    assert.deepEqual(sets, [[arc, str]]);
    assert.deepEqual(single, []);
  });

  it('still opens a single IFC file the way it did', () => {
    render(<WallView />);
    const arc = file('ARC.ifc');
    pick(picker(), arc);
    assert.deepEqual(single, [arc]);
    assert.deepEqual(sets, []);
  });
});

describe('the viewport router answers ifc-lite:load-files (#863)', () => {
  function Router({ routed }: { routed: File[][] }) {
    useOpenModelFiles((files) => { routed.push(files); }, () => true);
    return null;
  }

  it('routes every model file of the set together, in one call', () => {
    const routed: File[][] = [];
    render(<Router routed={routed} />);
    const arc = file('ARC.ifc');
    const str = file('STR.ifc');
    act(() => { window.dispatchEvent(new CustomEvent(EVENT_LOAD_FILES, { detail: [arc, str] })); });
    assert.deepEqual(routed, [[arc, str]]);
  });
});
