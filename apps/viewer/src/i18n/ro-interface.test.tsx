/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { LanguagePicker } from '@/components/viewer/ifcsheet/LanguagePicker';
import { ProjectDrawer } from '@/components/viewer/wall/ProjectDrawer';
import { ToolRail } from '@/components/viewer/wall/ToolRail';
import { WallIntro } from '@/components/viewer/wall/WallIntro';
import { CutHeightControl } from '@/components/viewer/wall/ViewControls';
import { useWallNav } from '@/components/viewer/wall/wall-nav';
import { DxfR2000 } from '@/components/viewer/sheets/dxf-r2000';
import { layoutMaterialTakeoff, takeoffCsv } from '@/joinery/material-takeoff-layout';
import { checkCatalogue } from './catalogue-problems';
import { chooseLocale, provideLocaleActivator } from './locale-service';
import { LOCALE_STORAGE_KEY, activateStartupLocale, createLocaleActivator } from './locale-activation';
import { formatLocaleFixed } from './intlFormat';
import { getLocale, registerLocale, resolve, setLocale } from './registry';
import ro from './locales/ro';

/**
 * Switching the IfcSheet face to Romanian (#53): the Wall, the drawer, the
 * title block and the tool rail read in Romanian, a key Romanian lacks is
 * English, figures on screen follow the locale and exports do not, and the
 * choice is remembered.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 1234.5, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
}

const texts = (ui: HTMLElement, selector: string) => [...ui.querySelectorAll(selector)].map((n) => n.textContent ?? '');

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, drawer: true });
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
  registerLocale('ro', checkCatalogue(ro).catalogue);
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

describe('Romanian on the Wall', () => {
  it('renders the tool rail, the drawer and the title block in Romanian', () => {
    act(() => setLocale('ro'));
    const rail = render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} />);
    const buttons = texts(rail, 'button').join(' | ');
    assert.match(buttons, /Cotează întregul plan/);
    assert.match(buttons, /Etichetează tot/);
    const drawer = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    const drawerText = drawer.textContent ?? '';
    for (const word of ['Importă biblioteca', 'Planșe', 'Beneficiar', 'Adresă', 'Cartuș']) assert.ok(drawerText.includes(word), `${word} in the drawer: ${drawerText.slice(0, 300)}`);
    // A parameter's name in braces (`{Revision}`, #143) is a name a text refers to, not copy: it stays as written in every language.
    assert.doesNotMatch(drawerText.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, ''), /Client|Revision|Title block|Sheets|Parameters|Layout/);
  });

  it('says the counts in the Romanian plural of each number', () => {
    act(() => setLocale('ro'));
    assert.equal(resolve('wall.intro.sheets', { count: 1 }), '1 planșă');
    assert.equal(resolve('wall.intro.sheets', { count: 2 }), '2 planșe');
    assert.equal(resolve('wall.intro.sheets', { count: 19 }), '19 planșe');
    assert.equal(resolve('wall.intro.sheets', { count: 20 }), '20 de planșe');
    assert.equal(resolve('check.untaggedOpenings', { view: 'Plan parter', sheet: 'A-101', count: 20, what: resolve('check.what.door', { count: 20 }) }), 'Plan parter de pe A-101: 20 de uși fără etichetă.');
  });

  it('falls back to English for a key Romanian lacks, never a raw key', () => {
    const { 'wall.fit': _fit, ...rest } = checkCatalogue(ro).catalogue;
    void _fit;
    registerLocale('ro', rest);
    act(() => setLocale('ro'));
    assert.equal(resolve('wall.fit'), 'Fit');
    assert.equal(resolve('wall.tb.done'), 'Gata');
    const ui = render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} />);
    assert.doesNotMatch(ui.textContent ?? '', /wall\.[a-z]/);
  });
});

describe('Figures follow the locale on screen, never in an export', () => {
  it('shows 1234.5 as 1.234,5 on the Wall', () => {
    act(() => setLocale('ro'));
    assert.equal(formatLocaleFixed(getLocale(), 1234.5, 1), '1.234,5');
    const intro = render(<WallIntro modelName="Casa" extent={HOUSE} onHang={() => {}} />);
    assert.match(intro.textContent ?? '', /1\.234,5 x 7,0 m/);
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan');
    assert.ok(plan && plan.kind === 'plan');
    const cut = render(<CutHeightControl view={{ ...plan, cutHeight: 1.1 }} />);
    assert.match(cut.textContent ?? '', /1,10m/);
    assert.match(cut.textContent ?? '', /0,5/);
  });

  it('writes the takeoff table in the locale and its CSV and a DXF coordinate the same in every locale', () => {
    const rows = [{ material: 'Beton', elements: 3, volume: 12.5, area: 1234.5, classes: ['IfcWall'] }];
    const labels = { title: 'T', material: 'M', elements: 'E', volume: 'V', area: 'A', usedIn: 'U', total: 'Tot' };
    const cells = (l: typeof labels & { number?: (v: number, d: number) => string }) => layoutMaterialTakeoff(rows, l).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    assert.ok(cells(labels).includes('1234.50'));
    assert.ok(cells({ ...labels, number: (v, d) => formatLocaleFixed('ro', v, d) }).includes('1.234,50'));
    assert.match(takeoffCsv(rows, labels), /,1234\.5,/);

    const dxf = (locale: string) => {
      act(() => setLocale(locale));
      const w = new DxfR2000(1);
      w.line({ x: 1234.5, y: 0.25 }, { x: 0, y: 0 }, w.layer('A', { color: '#000000' }));
      return new TextDecoder('windows-1252').decode(w.bytes('x'));
    };
    const english = dxf('en');
    const romanian = dxf('ro');
    assert.equal(romanian, english);
    assert.match(romanian, /\n\s*10\n1234\.5\n/);
    assert.doesNotMatch(romanian, /1234,5/);
  });
});

describe('The language choice in the header', () => {
  it('lists the languages, switches the Wall and remembers the choice across a reload', async () => {
    const storage = memoryStorage();
    const activator = () => createLocaleActivator({ ro: async () => ro });
    provideLocaleActivator(activator(), storage);
    const ui = render(<LanguagePicker />);
    const select = ui.querySelector('select');
    assert.ok(select);
    assert.deepEqual(texts(ui, 'option'), ['English', 'Română']);
    assert.equal(select.getAttribute('aria-label'), 'Language');

    await act(async () => {
      select.value = 'ro';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
      for (let i = 0; i < 50 && storage.values.get(LOCALE_STORAGE_KEY) !== 'ro'; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(getLocale(), 'ro');
    assert.equal(select.getAttribute('aria-label'), 'Limba');
    assert.equal(storage.values.get(LOCALE_STORAGE_KEY), 'ro');

    // A reload: English again in memory, the stored choice read back at startup.
    act(() => setLocale('en'));
    let active = '';
    await act(async () => { active = await activateStartupLocale(activator(), { search: '', storage, languages: ['en-US'] }); });
    assert.equal(active, 'ro');
    assert.equal(getLocale(), 'ro');

    await act(async () => { await chooseLocale('en'); });
    assert.equal(storage.values.get(LOCALE_STORAGE_KEY), 'en');
  });

  it('does not throw when storage refuses', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      provideLocaleActivator(createLocaleActivator({ ro: async () => ro }), { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
      await act(async () => { await chooseLocale('ro'); });
      assert.equal(getLocale(), 'ro');
    } finally {
      console.warn = warn;
    }
  });
});
