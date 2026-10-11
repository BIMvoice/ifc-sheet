/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup } from '@/test/render.js';
import { DEFAULT_APPEARANCE_SETTINGS } from '@/lib/appearance/settings.js';
import { resolveAppearanceAssignments } from '@/lib/appearance/assignments/resolve.js';
import type { AppearanceAssignment } from '@/lib/appearance/assignments/types.js';
import { registerLocale, setLocale, type Catalogue } from '@/i18n';
import { AppearanceAssignmentList } from './AppearanceAssignmentList.js';

afterEach(() => {
  cleanup();
  setLocale('en');
});

function assignment(id: string, members = [10], excluded = [] as number[]): AppearanceAssignment {
  return {
    id,
    model: { slotId: 'model-slot', modelId: 'model', name: 'Building', sourceSha256: 'a'.repeat(64), revision: 'r' },
    source: { id: 'b'.repeat(64), name: id, width: 2, height: 2 },
    settings: { ...DEFAULT_APPEARANCE_SETTINGS },
    query: { kind: 'model' },
    members: members.map(expressId => ({ expressId, GlobalId: `wall-${expressId}` })),
    excludedGlobalIds: excluded.map(expressId => `wall-${expressId}`),
  };
}

function mixedCountRows() {
  return resolveAppearanceAssignments([
    assignment('Brick', [10, 11, 12, 13], [13]),
    assignment('Stone', [12]),
  ]);
}

function renderedSummary(locale: string, catalogue: Catalogue): string {
  registerLocale(locale, catalogue);
  setLocale(locale);
  return render(
    <AppearanceAssignmentList rows={mixedCountRows()} disabled={false} objectName={() => 'Wall'}
      onMove={noop} onRemove={noop} onExclude={noop} />,
  ).textContent ?? '';
}

const noop = () => {};

it('renders the English catalogue value by default (#4785)', () => {
  const container = render(
    <AppearanceAssignmentList
      rows={resolveAppearanceAssignments([assignment('Brick')])}
      disabled={false}
      objectName={() => 'Wall'}
      onMove={noop}
      onRemove={noop}
      onExclude={noop}
    />,
  );
  const section = container.querySelector('section[aria-label="Appearance assignments"]');
  assert.ok(section, 'section aria-label resolves from the catalogue');
  assert.ok(section.textContent?.includes('Assignments'));
  assert.ok(
    section.textContent?.includes(
      'Later assignments replace earlier ones on overlapping objects. Excluding an object here keeps any earlier assignment.',
    ),
  );
  assert.ok(section.textContent?.includes('Review objects and exceptions'));
});

it('renders a registered locale value when present, and falls back to English for a key that locale omits (#4785)', () => {
  // 'de' translates the heading but deliberately does not cover the
  // description — that key must still surface in English, not blank.
  registerLocale('de', { 'appearanceAssignmentList.heading': 'Zuweisungen' });
  setLocale('de');
  const container = render(
    <AppearanceAssignmentList
      rows={resolveAppearanceAssignments([assignment('Brick')])}
      disabled={false}
      objectName={() => 'Wall'}
      onMove={noop}
      onRemove={noop}
      onExclude={noop}
    />,
  );
  assert.ok(container.textContent?.includes('Zuweisungen'));
  // Fallback: English description, not an empty string.
  assert.ok(
    container.textContent?.includes(
      'Later assignments replace earlier ones on overlapping objects. Excluding an object here keeps any earlier assignment.',
    ),
  );
});

it('localizes interpolated controls and the plural-aware summary (#4785)', () => {
  registerLocale('fr', {
    'appearanceAssignmentList.assignmentAriaLabel': 'Rang {position} : {sourceName} sur {modelName}',
    'appearanceAssignmentList.moveEarlierAriaLabel': 'Monter le rang {position}',
    'appearanceAssignmentList.moveLaterAriaLabel': 'Descendre le rang {position}',
    'appearanceAssignmentList.removeAriaLabel': 'Supprimer le rang {position}',
    'appearanceAssignmentList.summary': '{products} · {excluded} · {overridden}',
    'appearanceAssignmentList.summaryProducts': { one: '{count} objet', other: '{count} objets' },
    'appearanceAssignmentList.summaryExcluded': { one: '{count} exclu', other: '{count} exclus' },
    'appearanceAssignmentList.summaryOverridden': { one: '{count} remplacé', other: '{count} remplacés' },
    'appearanceAssignmentList.reviewAriaLabel': 'Examiner les objets du rang {position}',
  });
  setLocale('fr');
  const container = render(
    <AppearanceAssignmentList
      rows={mixedCountRows()}
      disabled={false}
      objectName={() => 'Wall'}
      onMove={noop}
      onRemove={noop}
      onExclude={noop}
    />,
  );

  assert.ok(container.querySelector('li[aria-label="Rang 1 : Brick sur Building"]'));
  assert.ok(container.querySelector('button[aria-label="Monter le rang 1"]'));
  assert.ok(container.querySelector('button[aria-label="Descendre le rang 1"]'));
  assert.ok(container.querySelector('button[aria-label="Supprimer le rang 1"]'));
  assert.ok(container.querySelector('button[aria-label="Examiner les objets du rang 1"]'));
  assert.match(container.textContent ?? '', /2 objets · 1 exclu · 1 remplacé/);
});

it('pluralizes each mixed Russian count independently in the mounted list (#4785)', () => {
  const text = renderedSummary('ru', {
    'appearanceAssignmentList.summary': '{products} · {excluded} · {overridden}',
    'appearanceAssignmentList.summaryProducts': {
      one: '{count} объект', few: '{count} объекта', many: '{count} объектов', other: '{count} объекта',
    },
    'appearanceAssignmentList.summaryExcluded': {
      one: '{count} исключён', few: '{count} исключены', many: '{count} исключены', other: '{count} исключено',
    },
    'appearanceAssignmentList.summaryOverridden': {
      one: '{count} заменён', few: '{count} заменены', many: '{count} заменены', other: '{count} заменено',
    },
  });
  assert.match(text, /2 объекта · 1 исключён · 1 заменён/);
});

it('pluralizes each mixed Arabic count independently in the mounted list (#4785)', () => {
  const text = renderedSummary('ar', {
    'appearanceAssignmentList.summary': '{products} · {excluded} · {overridden}',
    'appearanceAssignmentList.summaryProducts': {
      zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{count} عناصر', many: '{count} عنصرًا', other: '{count} عنصر',
    },
    'appearanceAssignmentList.summaryExcluded': {
      zero: 'لا مستبعد', one: 'واحد مستبعد', two: 'اثنان مستبعدان', few: '{count} مستبعدة', many: '{count} مستبعدًا', other: '{count} مستبعد',
    },
    'appearanceAssignmentList.summaryOverridden': {
      zero: 'لا مستبدل', one: 'واحد مستبدل', two: 'اثنان مستبدلان', few: '{count} مستبدلة', many: '{count} مستبدلًا', other: '{count} مستبدل',
    },
  });
  assert.match(text, /عنصران · واحد مستبعد · واحد مستبدل/);
});
