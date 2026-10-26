/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "Annotate the set" on the Wall (#333): the three commands default on, a run lists what happened to each view, in English and Romanian. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { annotateSetEn } from '@/i18n/catalogues/annotate-set.en';
import { annotateSetRo } from '@/i18n/catalogues/annotate-set.ro';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { useAnnotatePanel } from '@/annotate-set/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { useViewDrawings } from '@/project/view-drawings';
import type { ProjectLevel } from '@/project/types';
import { cleanup, click, render } from '@/test/render.js';
import { useWallNav } from '../wall/wall-nav';
import { TemplateReport } from '../wall/SetTemplate';
import { useSetTemplates } from '@/set-template/store';
import { AnnotateSet } from './AnnotateSet';

const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
const box = (ui: HTMLElement, text: string) => [...ui.querySelectorAll('label')].find((l) => l.textContent?.includes(text))!.querySelector('input')!;

beforeEach(() => {
  resetProject();
  act(() => setLocale('en'));
  useAnnotatePanel.setState({ on: { tagall: true, dimall: true, levelall: true }, running: null, summary: null });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
  const views = [...defaultViews(LEVELS, 1)];
  useProjectStore.setState({ levels: LEVELS, views, sheets: [{ id: 's', name: 'S', number: 'A-1', series: 'plans', viewports: [] } as never] });
});
afterEach(() => { cleanup(); useViewDrawings.setState({ byView: {} }); act(() => setLocale('en')); });

const open = (ui: HTMLElement) => click([...ui.querySelectorAll('button')].find((b) => b.getAttribute('aria-pressed') !== null)!);

describe('Annotate the set', () => {
  it('opens a panel with TAGALL, DIMALL and LEVELALL all on', () => {
    const ui = render(<AnnotateSet />);
    open(ui);
    assert.equal(useWallNav.getState().panel, 'annotate');
    for (const text of ['TAGALL', 'DIMALL', 'LEVELALL']) assert.equal(box(ui, text).checked, true, text);
  });

  it('says to choose a command when none is on, and will not run', () => {
    const ui = render(<AnnotateSet />);
    open(ui);
    for (const text of ['TAGALL', 'DIMALL', 'LEVELALL']) click(box(ui, text));
    assert.match(ui.textContent ?? '', /Choose at least one command/);
    assert.equal([...ui.querySelectorAll('button')].find((b) => b.textContent === 'Annotate the set' && b.getAttribute('aria-pressed') === null)!.disabled, true);
  });

  it('runs on every plan, elevation and section and lists each view, with the reason for one whose drawing is not there', async () => {
    const views = useProjectStore.getState().views.filter((v) => v.kind !== '3d');
    assert.ok(views.length >= 5, 'the default set has a plan and four elevations');
    useViewDrawings.setState({ byView: Object.fromEntries(views.map((v) => [v.id, { drawing: null, status: 'error' as const, progress: 0, phase: '', error: 'no geometry' }])) });
    const ui = render(<AnnotateSet />);
    open(ui);
    const run = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Annotate the set' && b.getAttribute('aria-pressed') === null)!;
    await act(async () => { click(run); await new Promise((r) => setTimeout(r, 100)); });
    const listed = [...ui.querySelectorAll('[data-testid="annotate-view"]')];
    assert.equal(listed.length, views.length);
    assert.match(listed[0].textContent ?? '', /no drawing to annotate \(no geometry\)/);
  });

  it('says on the page a template\'s set arrives on that the commands it records are running, and what they did', () => {
    const summary = { views: [{ viewId: 'a', name: 'Ground Floor', kind: 'plan' as const, results: [] }, { viewId: 'b', name: 'North', kind: 'elevation' as const, results: [], skipped: { key: 'wall.annotate.reason.noDrawing' as const, params: { error: 'timeout' } } }], added: 7, cancelled: false };
    useSetTemplates.setState({ report: { template: 'Office', notes: [], annotated: 'running' } });
    const ui = render(<TemplateReport />);
    assert.match(ui.textContent ?? '', /are running on the new set/);
    act(() => useSetTemplates.setState({ report: { template: 'Office', notes: [], annotated: summary } }));
    assert.match(ui.textContent ?? '', /ran on the new set: 7 added on 2 views\. Views skipped: 1\./);
    act(() => useSetTemplates.setState({ report: null }));
  });

  it('reads in Romanian: every key the panel uses has its Romanian', () => {
    for (const key of Object.keys(annotateSetEn)) assert.ok(key in annotateSetRo, key);
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    const ui = render(<AnnotateSet />);
    assert.match(ui.textContent ?? '', /Adnotați setul/);
  });
});
