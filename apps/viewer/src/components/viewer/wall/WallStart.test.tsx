/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The start page puts opening your own IFC first: a dropped or chosen IFC file goes to the one load path
 * (`ifc-lite:load-file`), anything else is refused by name and never loaded, and the set templates wait
 * behind one line until one is armed.
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
import { pacSetTemplate } from '@bimvoice/ifcsheet';
import { WallView } from './WallView';

// happy-dom's DragEvent ignores `dataTransfer` in its init, so the event is handed what a browser gives it.
function drop(target: EventTarget, type: 'dragover' | 'drop', ...files: File[]): Event {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files } });
  act(() => { target.dispatchEvent(event); });
  return event;
}

const file = (name: string): File => new File(['x'], name);
const page = (): HTMLElement => document.querySelector('[data-testid="wall-start"]') as HTMLElement;

let loaded: File[] = [];
const onLoad = (e: Event): void => { loaded.push((e as CustomEvent<File>).detail); };

beforeEach(() => {
  resetProject();
  armTemplate(null);
  useViewerStore.setState({ models: new Map() });
  loaded = [];
  window.addEventListener(EVENT_LOAD_FILE, onLoad);
});
afterEach(() => {
  window.removeEventListener(EVENT_LOAD_FILE, onLoad);
  armTemplate(null);
  cleanup();
});

describe('the start page, before any model is open', () => {
  it('opens an IFC file dropped anywhere on it, and keeps the browser from leaving for the file', () => {
    render(<WallView />);
    const ifc = file('House.IFC');
    assert.equal(drop(page(), 'dragover', ifc).defaultPrevented, true, 'the page is a drop target');
    assert.equal(drop(page(), 'drop', ifc).defaultPrevented, true);
    assert.deepEqual(loaded, [ifc]);
    assert.equal(document.querySelector('[role="alert"]'), null);
  });

  it('refuses a file that is not IFC by name and loads nothing', () => {
    render(<WallView />);
    const event = drop(page(), 'drop', file('scan.glb'));
    assert.equal(event.defaultPrevented, true, 'the browser still does not leave for the file');
    assert.deepEqual(loaded, []);
    const alert = document.querySelector('[role="alert"]');
    assert.match(alert?.textContent ?? '', /scan\.glb is not an IFC file/);
    assert.match(alert?.textContent ?? '', /\.ifc \.ifcx \.ifczip/);
  });

  it('takes the IFC out of a mixed drop', () => {
    render(<WallView />);
    const ifc = file('tower.ifczip');
    drop(page(), 'drop', file('notes.pdf'), ifc);
    assert.deepEqual(loaded, [ifc]);
  });

  it('offers only IFC in the file picker', () => {
    render(<WallView />);
    const input = page().querySelector('[data-testid="wall-start-drop"] input[type="file"]') as HTMLInputElement;
    assert.equal(input.accept, '.ifc,.ifcx,.ifczip');
  });

  it('keeps the set templates behind one line until a template is armed', () => {
    render(<WallView />);
    const details = page().querySelector('details') as HTMLDetailsElement;
    assert.equal(details.open, false, 'closed on arrival');
    act(() => { armTemplate(pacSetTemplate({ name: 'PAC', plans: 'Plans', facades: 'Facades', sections: 'Sections' })); });
    assert.equal(details.open, true, 'an armed template shows its "choose a model" step');
  });
});
