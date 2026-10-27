/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The face credits ifc-lite itself, because the status bar's credit sits under it (#361), and keeps it out of sheet output. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { IFCLITE_URL } from '@/lib/credits';
import { resetProject } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { SheetPaper } from '../sheets/SheetPaper';
import { sheetSvgText } from '../sheets/sheet-export';
import { IfcSheetShell } from './IfcSheetShell.js';

beforeEach(() => {
  resetProject();
  registerLocale('ro', checkCatalogue(ro).catalogue);
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const credit = (ui: HTMLElement) => ui.querySelector<HTMLAnchorElement>('a[href="' + IFCLITE_URL + '"]');

describe('IfcSheetShell credit', () => {
  for (const [locale, label, name] of [
    ['en', 'Built on IFClite →', /^Built on IFClite/],
    ['ro', 'Construit pe IFClite →', /^Construit pe IFClite/],
  ] as const) {
    it(`shows a focusable, safe link to the ifc-lite page in ${locale}`, () => {
      act(() => setLocale(locale));
      const link = credit(render(<IfcSheetShell />));
      assert.ok(link, 'the credit link is on the face');
      assert.equal(link.getAttribute('href'), 'https://ifclite.dev');
      assert.equal(link.textContent, label);
      assert.match(link.getAttribute('aria-label') ?? '', name);
      assert.equal(link.getAttribute('target'), '_blank');
      assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
      assert.notEqual(link.getAttribute('tabindex'), '-1');
      link.focus();
      assert.equal(document.activeElement, link);
    });
  }

  it('is not part of a sheet\'s output', () => {
    const sheet: ProjectSheet = { id: 's1', number: 'A-101', autoNumber: false, name: 'A-101', createdAt: 1, paper: 'A1', orientation: 'landscape', viewports: [] };
    const ui = render(<SheetPaper sheet={sheet} projectName="Untitled" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: undefined, drawing: null, drafts: [] })} />);
    const svg = ui.querySelector('svg');
    assert.ok(svg, 'the sheet draws');
    const out = sheetSvgText(svg as unknown as SVGSVGElement, sheet);
    assert.doesNotMatch(out, /ifc-?lite|Construit pe|Built on/i);
    assert.equal(credit(ui), null);
  });
});
