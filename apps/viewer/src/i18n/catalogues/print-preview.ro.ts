/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `print-preview.en.ts`: the preview at paper size. Term choices: `../ro-glossary.md`. */
export const printPreviewRo = {
  'printPreview.open': 'Previzualizare la dimensiunea hârtiei',
  'printPreview.title': 'Previzualizare la tipărire: {number} {name}',
  'printPreview.paper': 'Hârtie {width} x {height} mm',
  'printPreview.zoomOut': 'Micșorează',
  'printPreview.zoomIn': 'Mărește',
  'printPreview.zoomLevel': '{percent}% din dimensiunea hârtiei',
  'printPreview.fit': 'Încadrează',
  'printPreview.actual': '100%',
  'printPreview.close': 'Închide previzualizarea',
  'printPreview.warnings': 'În afara zonei de desen',
  'printPreview.clean': 'Tot ce se află pe planșă încape în zona de desen.',
  'printPreview.reason.frame': '{item} depășește chenarul.',
  'printPreview.reason.titleBlock': '{item} se suprapune cu cartușul.',
  'printPreview.reason.area': '{item} este în afara zonei de desen.',
  'printPreview.item.viewport': '{name} (1:{scale})',
  'printPreview.item.draft': '{kind} în lucru',
  'printPreview.bar': '1 m la 1:{scale}',
  'printPreview.bars': 'Bare de referință',
  'printPreview.barLength': '{mm} mm pe hârtie',
  'printPreview.scaleNote': 'La 100%, un milimetru de hârtie este un milimetru CSS. Acesta este un milimetru adevărat doar pe un ecran calibrat pentru asta: puneți o riglă pe o bară de referință ca să verificați ecranul dumneavoastră. Barele apar doar aici; nu se tipăresc niciodată.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
