/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Review of #111: the site area field read "1.250,5" or "600 m2" as nothing and so erased the stored site area.
 * It now reads a decimal comma, thousands separators and a trailing m² / m2, and text it cannot read keeps the
 * stored value (only an empty field clears it, back to the model's IfcSite area).
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, render, type } from '@/test/render.js';
import { resetProject, setProjectSiteArea, useProjectStore } from '@/project/project-store';
import { SiteAreaField } from './SiteAreaField';

beforeEach(() => {
  resetProject();
  setProjectSiteArea(1000);
});
afterEach(() => cleanup());

function enter(text: string): HTMLInputElement {
  const input = render(<SiteAreaField modelSiteArea={500} />).querySelector('input')!;
  type(input, text);
  blur(input);
  return input;
}

describe('the site area field', () => {
  for (const [text, area] of [
    ['1.250,5', 1250.5], ['1,250.5', 1250.5], ['1 250,5', 1250.5], ['1250,5', 1250.5], ['1250.5', 1250.5],
    ['600 m2', 600], ['600m²', 600], ['600,25 m²', 600.25],
  ] as const) {
    it(`reads "${text}" as ${area} m²`, () => {
      enter(text);
      assert.equal(useProjectStore.getState().siteArea, area);
    });
  }

  for (const text of ['abc', '12 ha', '0', '-5', '1.2.3,4,5']) {
    it(`keeps the stored site area when given "${text}", and shows it again`, () => {
      const input = enter(text);
      assert.equal(useProjectStore.getState().siteArea, 1000);
      assert.equal(input.value, '1000');
    });
  }

  it('clears the site area when emptied, so the model\'s is used', () => {
    enter('  ');
    assert.equal(useProjectStore.getState().siteArea, undefined);
  });
});
