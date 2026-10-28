/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The how-to pages (#455): each short, and complete in English and Romanian. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { HOWTO_PAGES, howToStepKeys, howToTitleKey } from './howto-pages.js';

afterEach(() => setLocale('en'));

describe('how-to pages', () => {
  it('has the six pages the help menu promises', () => {
    assert.deepEqual(HOWTO_PAGES.map((p) => p.id), ['open', 'hang', 'dimension', 'schedules', 'titleBlock', 'export']);
  });

  for (const tag of ['en', 'ro'] as const) {
    it(`every title and step is written in ${tag}, 5 to 8 steps a page`, () => {
      registerLocale('ro', ro);
      setLocale(tag);
      for (const { id } of HOWTO_PAGES) {
        const steps = howToStepKeys(id);
        assert.ok(steps.length >= 5 && steps.length <= 8, `${id} has ${steps.length} steps`);
        for (const key of [howToTitleKey(id), ...steps]) {
          const text = resolve(key);
          assert.ok(text && text !== key, `${key} resolves in ${tag}`);
          if (tag === 'ro' && key !== howToTitleKey(id)) {
            setLocale('en');
            assert.notEqual(text, resolve(key), `${key} is translated`);
            setLocale('ro');
          }
        }
      }
    });
  }

  it('names the buttons as the interface labels them today', () => {
    // Each page leans on these labels; a renamed button must change its step too.
    const needs: Record<string, RegExp[]> = {
      open: [/Open a model/, /Demo project/, /Hang it on the wall/, /Save the project/],
      hang: [/1 : 50/, /\+ Sheet/],
      dimension: [/Dimension/, /Tag/, /Done/],
      schedules: [/\+ Door and window schedule/, /\+ Material takeoff/, /\+ Drawing register/],
      titleBlock: [/Title block/, /Edit the layout/],
      export: [/PDF/, /DXF/, /Preview at paper size/, /What is missing/, /Issue the set/, /Issue as PDF/],
    };
    const labels: Record<string, string> = {
      'wall.shell.open': 'Open a model', 'wall.shell.demo': 'Demo project', 'wall.intro.hang': 'Hang it on the wall',
      'wall.shell.saveProject': 'Save the project', 'wall.project.addSheet': '+ Sheet', 'wall.tool.dimension': 'Dimension',
      'wall.tool.tag': 'Tag', 'wall.tool.done': 'Done', 'wall.project.addJoinery': '+ Door and window schedule',
      'wall.project.addTakeoff': '+ Material takeoff', 'wall.project.addRegister': '+ Drawing register',
      'wall.tb.title': 'Title block', 'tblayout.edit': 'Edit the layout', 'printPreview.open': 'Preview at paper size',
      'check.section': 'What is missing', 'issue.section': 'Issue the set', 'issue.pdf': 'Issue as PDF',
    };
    for (const [key, label] of Object.entries(labels)) assert.equal(resolve(key as never), label, `${key} is still "${label}"`);
    for (const [id, patterns] of Object.entries(needs)) {
      const text = howToStepKeys(id as never).map((k) => resolve(k)).join('\n');
      for (const p of patterns) assert.match(text, p, `${id} mentions ${p}`);
    }
  });
});
