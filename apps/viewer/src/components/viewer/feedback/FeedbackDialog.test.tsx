/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render, type, waitFor } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { useViewerStore } from '@/store';
import { IfcSheetShell } from '../ifcsheet/IfcSheetShell.js';
import { stepInto, useWallNav } from '../wall/wall-nav.js';

/**
 * #148: the Feedback button on the Wall opens a form that, on submit, opens a
 * pre-filled GitHub "new issue" page in a new tab. Nothing is sent by the app.
 */

const initial = useViewerStore.getState();
let opened: { url: string; target: string | undefined; features: string | undefined }[] = [];
let fetched = 0;
const realOpen = window.open;
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetProject();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
  window.localStorage.setItem('ifc-lite:tours:v1', JSON.stringify({ notices: { 'ifcsheet-tour-seen': 'x' } }));
  opened = [];
  fetched = 0;
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    opened.push({ url: String(url), target, features });
    return null;
  }) as typeof window.open;
  globalThis.fetch = (async () => { fetched += 1; return new Response('{}'); }) as typeof fetch;
});
afterEach(() => {
  cleanup();
  window.open = realOpen;
  globalThis.fetch = realFetch;
  useViewerStore.setState(initial);
});

const dialog = (): HTMLElement | null => document.querySelector('[role="dialog"]');
const byLabel = <T extends HTMLElement>(text: RegExp): T => {
  const label = [...document.querySelectorAll('label')].find((l) => text.test(l.textContent ?? ''));
  const el = label?.querySelector('input,textarea') ?? (label?.htmlFor ? document.getElementById(label.htmlFor) : null);
  assert.ok(el, `a field labelled ${text}`);
  return el as T;
};
const openForm = (): void => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Feedback');
  assert.ok(button, 'a Feedback button in the Wall header');
  click(button);
};

describe('Feedback form (#148)', () => {
  it('opens GitHub with the bug template, labels and title; context only for the ticked parts; no file name', async () => {
    useViewerStore.setState({ models: new Map([['m', { name: 'Secret-Client-Tower.ifc' } as never]]) });
    render(<IfcSheetShell />);
    openForm();
    await waitFor(() => dialog() !== null, 'the form opens');

    const form = dialog() as HTMLElement;
    assert.match(form.textContent ?? '', /Open GitHub opens a new tab/);
    assert.match(form.textContent ?? '', /GitHub account/i);

    type(byLabel<HTMLInputElement>(/^Title/), 'Scale bar is wrong');
    type(byLabel<HTMLTextAreaElement>(/^Description/), 'It says 1:50 on a 1:100 view.');
    const place = byLabel<HTMLInputElement>(/sheet.*tool|where you are/i);
    const env = byLabel<HTMLInputElement>(/version.*browser/i);
    assert.equal(env.checked, true, 'the first part is on by default');
    assert.equal(place.checked, false, 'the others are off');

    const submit = [...form.querySelectorAll('button')].find((b) => /Open GitHub/.test(b.textContent ?? ''));
    assert.ok(submit);
    click(submit);

    assert.equal(opened.length, 1);
    const u = new URL(opened[0]?.url ?? '');
    assert.equal(u.origin + u.pathname, 'https://github.com/BIMvoice/ifcsheet/issues/new');
    assert.equal(u.searchParams.get('template'), 'bug.yml');
    assert.equal(u.searchParams.get('labels'), 'bug');
    assert.equal(u.searchParams.get('title'), 'Scale bar is wrong');
    assert.equal(u.searchParams.get('description'), 'It says 1:50 on a 1:100 view.');
    const context = u.searchParams.get('context') ?? '';
    assert.match(context, /IfcSheet/);
    assert.doesNotMatch(context, /Screen:/, 'the place was not ticked');
    assert.doesNotMatch(opened[0]?.url ?? '', /Secret|Tower|\.ifc/i, 'no model or file name');
    assert.equal(opened[0]?.target, '_blank');
    assert.match(opened[0]?.features ?? '', /noopener/);
    assert.equal(fetched, 0, 'the app calls no API');
  });

  it('ticking the place adds the sheet number and tool, and the preview shows exactly what is sent', async () => {
    render(<IfcSheetShell />);
    const sheetId = useProjectStore.getState().sheets[0]?.id ?? null;
    stepInto(sheetId);
    openForm();
    await waitFor(() => dialog() !== null, 'the form opens');
    type(byLabel<HTMLInputElement>(/^Title/), 'Hatch missing');
    click(byLabel<HTMLInputElement>(/sheet.*tool|where you are/i));
    const number = useProjectStore.getState().sheets[0]?.number ?? '';
    assert.ok(number);
    assert.match(document.querySelector('[data-feedback-preview]')?.textContent ?? '', new RegExp(number));
    click([...(dialog() as HTMLElement).querySelectorAll('button')].find((b) => /Open GitHub/.test(b.textContent ?? '')) as HTMLElement);
    assert.match(new URL(opened[0]?.url ?? '').searchParams.get('context') ?? '', new RegExp(`Sheet: ${number}`));
  });

  it('will not open GitHub without a title, and Escape closes the form without opening it', async () => {
    render(<IfcSheetShell />);
    openForm();
    await waitFor(() => dialog() !== null, 'the form opens');
    const submit = [...(dialog() as HTMLElement).querySelectorAll('button')].find((b) => /Open GitHub/.test(b.textContent ?? '')) as HTMLButtonElement;
    assert.equal(submit.disabled, true);
    click(submit);
    assert.equal(opened.length, 0);
    press(dialog() as HTMLElement, 'Escape');
    await waitFor(() => dialog() === null, 'Escape closes it');
    assert.equal(opened.length, 0);
  });

  it('a suggestion carries the enhancement label and a question the question label', async () => {
    render(<IfcSheetShell />);
    openForm();
    await waitFor(() => dialog() !== null, 'the form opens');
    click(byLabel<HTMLInputElement>(/^Suggestion/));
    type(byLabel<HTMLInputElement>(/^Title/), 'Add a north arrow');
    click([...(dialog() as HTMLElement).querySelectorAll('button')].find((b) => /Open GitHub/.test(b.textContent ?? '')) as HTMLElement);
    assert.equal(new URL(opened[0]?.url ?? '').searchParams.get('labels'), 'enhancement');
    assert.equal(new URL(opened[0]?.url ?? '').searchParams.get('template'), 'suggestion.yml');
  });
});
