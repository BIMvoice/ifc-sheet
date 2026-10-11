/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { render, cleanup } from '@/test/render';
import { useTranslation } from './useTranslation';
import { registerLocale, resolve, setLocale } from './registry';
import type { PluralTranslation, TranslationParameters } from './types';

afterEach(() => {
  cleanup();
  setLocale('en');
});

function Probe({ tag }: { tag: string }) {
  const { t } = useTranslation();
  return <span data-key={tag}>{t('mergeLayersBanner.reloadButton')}</span>;
}

function DynamicProbe({ count }: { count: number }) {
  const { t } = useTranslation();
  return <>
    <span data-key="named">{t('appearanceAssignmentList.assignmentAriaLabel', {
      position: 3,
      sourceName: 'Brick',
      modelName: 'North Wing',
    })}</span>
    <span data-key="plural">{t('appearanceAssignmentList.summaryProducts', { count })}</span>
  </>;
}

it('resolves a key from the English catalogue by default', () => {
  const container = render(<Probe tag="default" />);
  const span = container.querySelector('span[data-key="default"]');
  assert.equal(span?.textContent, 'Reload');
});

it('falls back to English when the active locale is missing the key (#4785)', () => {
  // 'xx' deliberately omits 'mergeLayersBanner.reloadButton'.
  registerLocale('xx', { 'mergeLayersBanner.titleEnabled': 'XX enabled' });
  setLocale('xx');
  const container = render(<Probe tag="fallback" />);
  const span = container.querySelector('span[data-key="fallback"]');
  assert.equal(span?.textContent, 'Reload');
});

it('a translation deliberately set to an empty string is NOT treated as missing (#4785)', () => {
  // Distinguishes "translator left it blank on purpose" from "key absent".
  registerLocale('yy', { 'mergeLayersBanner.reloadButton': '' });
  setLocale('yy');
  const container = render(<Probe tag="blank" />);
  const span = container.querySelector('span[data-key="blank"]');
  assert.equal(span?.textContent, '');
});

it('re-renders mounted consumers when the active catalogue is replaced (#4785)', () => {
  registerLocale('replaceable', { 'mergeLayersBanner.reloadButton': 'First' });
  setLocale('replaceable');
  const container = render(<Probe tag="replacement" />);
  const span = container.querySelector('span[data-key="replacement"]');
  assert.equal(span?.textContent, 'First');

  act(() => {
    registerLocale('replaceable', { 'mergeLayersBanner.reloadButton': 'Second' });
  });
  assert.equal(span?.textContent, 'Second');
});

it('interpolates named values from a registered locale (#4785)', () => {
  registerLocale('de', {
    'appearanceAssignmentList.assignmentAriaLabel':
      'Zuweisung {position}: {sourceName} in {modelName}',
  });
  setLocale('de');
  const container = render(<DynamicProbe count={1} />);
  assert.equal(
    container.querySelector('[data-key="named"]')?.textContent,
    'Zuweisung 3: Brick in North Wing',
  );
});

it('interpolates only own parameters, including from null-prototype maps (#4785)', () => {
  registerLocale('parameter-ownership', {
    'appearanceAssignmentList.assignmentAriaLabel':
      '{constructor}|{toString}|{missing}|{sourceName}',
  });
  setLocale('parameter-ownership');

  const inherited = Object.create({ sourceName: 'inherited' }) as TranslationParameters;
  assert.equal(
    resolve('appearanceAssignmentList.assignmentAriaLabel', inherited),
    '{constructor}|{toString}|{missing}|{sourceName}',
  );

  const own = Object.create(null, {
    constructor: { value: 'owned constructor', enumerable: true },
    toString: { value: 'owned toString', enumerable: true },
    sourceName: { value: 'Brick', enumerable: true },
  }) as TranslationParameters;
  assert.equal(
    resolve('appearanceAssignmentList.assignmentAriaLabel', own),
    'owned constructor|owned toString|{missing}|Brick',
  );
});

it('selects locale plural categories beyond the English one/other rule (#4785)', () => {
  registerLocale('ru', {
    'appearanceAssignmentList.summaryProducts': {
      one: 'ONE {count}',
      few: 'FEW {count}',
      many: 'MANY {count}',
      other: 'OTHER {count}',
    },
  });
  setLocale('ru');

  const one = render(<DynamicProbe count={1} />);
  assert.equal(one.querySelector('[data-key="plural"]')?.textContent, 'ONE 1');
  cleanup();
  const few = render(<DynamicProbe count={2} />);
  assert.equal(few.querySelector('[data-key="plural"]')?.textContent, 'FEW 2');
  cleanup();
  const many = render(<DynamicProbe count={5} />);
  assert.equal(many.querySelector('[data-key="plural"]')?.textContent, 'MANY 5');
});

const SUMMARY_KEY = 'appearanceAssignmentList.summaryProducts';

it('ignores an inherited plural count (#4785)', () => {
  registerLocale('en-US', {
    [SUMMARY_KEY]: { one: 'ONE {count}', other: 'OTHER {count}' },
  });
  setLocale('en-US');
  const inheritedCount = Object.create({ count: 1 }) as TranslationParameters;
  assert.equal(resolve(SUMMARY_KEY, inheritedCount), 'OTHER {count}');
});

it('ignores inherited plural categories and fallback forms (#4785)', () => {
  const inheritedCategory = Object.create(
    { one: 'INHERITED {count}' },
    { other: { value: 'OTHER {count}', enumerable: true } },
  ) as PluralTranslation;
  registerLocale('de', { [SUMMARY_KEY]: inheritedCategory });
  setLocale('de');
  assert.equal(resolve(SUMMARY_KEY, { count: 1 }), 'OTHER 1');

  const inheritedFallback = Object.create({ other: 'INHERITED OTHER {count}' }) as PluralTranslation;
  registerLocale('fr', { [SUMMARY_KEY]: inheritedFallback });
  setLocale('fr');
  assert.throws(() => resolve(SUMMARY_KEY, { count: 1 }), /must define its own "other" form/);
});

it('selects own plural forms and counts from null-prototype maps (#4785)', () => {
  const ownForms = Object.create(null, {
    one: { value: 'OWN ONE {count}', enumerable: true },
    other: { value: 'OWN OTHER {count}', enumerable: true },
  }) as PluralTranslation;
  const ownCount = Object.create(null, {
    count: { value: 1, enumerable: true },
  }) as TranslationParameters;
  registerLocale('en-GB', { [SUMMARY_KEY]: ownForms });
  setLocale('en-GB');
  assert.equal(resolve(SUMMARY_KEY, ownCount), 'OWN ONE 1');
});

it('uses English plural rules when a plural message falls back to English (#4785)', () => {
  registerLocale('ru-fallback', {});
  setLocale('ru-fallback');
  const container = render(<DynamicProbe count={21} />);
  assert.match(container.querySelector('[data-key="plural"]')?.textContent ?? '', /^21 objects/);
});

it('selects plural categories at the same precision shown by interpolation (#4785)', () => {
  const english = render(<DynamicProbe count={1.0001} />);
  assert.match(english.querySelector('[data-key="plural"]')?.textContent ?? '', /^1\.0001 objects/);
  cleanup();

  registerLocale('ar', {
    'appearanceAssignmentList.summaryProducts': {
      zero: 'ZERO {count}',
      one: 'ONE {count}',
      two: 'TWO {count}',
      few: 'FEW {count}',
      many: 'MANY {count}',
      other: 'OTHER {count}',
    },
  });
  setLocale('ar');
  const nearZero = render(<DynamicProbe count={0.0001} />);
  assert.equal(nearZero.querySelector('[data-key="plural"]')?.textContent, 'OTHER 0.0001');
  cleanup();
  const nearTwo = render(<DynamicProbe count={2.0001} />);
  assert.equal(nearTwo.querySelector('[data-key="plural"]')?.textContent, 'OTHER 2.0001');
});
