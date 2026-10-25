/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
import { BOQ_WORDS_EN } from '@bimvoice/ifcsheet/boq-words';

/**
 * The bill of quantities (antemasuratoare, #75): the mapping table editor, its preview and the card on the Wall. The words of the table itself
 * and of its refusals are the engine's (`BOQ_WORDS_EN`, the one copy the command line prints too). Romanian: `boq.ro.ts`.
 */
export const boqEn = {
  ...BOQ_WORDS_EN,
  'boq.newName': 'Bill of quantities',
  'wall.project.addBoq': '+ Bill of quantities (antemăsurătoare)',
  'library.kind.boqArticles': 'Bill of quantities articles',
  'boq.card.title': 'Bill of quantities',
  'boq.card.summary': '{count} articles',
  'boq.card.summaryEmpty': 'No articles yet',
  'boq.card.hint': 'Maps the model\'s types, materials and classes to your own estimate articles and adds up the quantities the model declares. The table is saved with the project and travels in a library file.',
  'boq.card.edit': 'Edit the mapping table',
  'boq.card.detail': 'A row per type under each article',
  'boq.card.missing': '{count} elements lack a quantity an article takes; they are left out, not counted as zero.',
  'boq.editor.title': 'Mapping table',
  'boq.editor.intro': 'Each article picks elements by type, material or IFC class, takes one quantity the model declares, multiplies it by a factor and adds waste. IfcSheet ships no norm or article codes: enter your own.',
  'boq.editor.empty': 'No articles yet. Add the first one.',
  'boq.editor.add': 'Add an article',
  'boq.editor.close': 'Close',
  'boq.editor.remove': 'Remove article {code}',
  'boq.editor.article': 'Article {n}',
  'boq.editor.unnamed': 'no code yet',
  'boq.field.code': 'Article code',
  'boq.field.description': 'Description',
  'boq.field.unit': 'Unit',
  'boq.field.type': 'Type',
  'boq.field.material': 'Material',
  'boq.field.class': 'IFC class',
  'boq.field.quantity': 'Quantity',
  'boq.field.factor': 'Factor',
  'boq.field.waste': 'Waste %',
  'boq.field.any': 'any',
  'boq.field.picks': 'Picks elements by',
  'boq.field.formula': 'Formula',
  'boq.field.filter': 'Only elements whose property',
  'boq.result.total': '{total} {unit}',
  'boq.result.counts': '{matched} elements picked, {counted} with the quantity',
  'boq.result.missing': '{count} without {quantity}: left out, not zero',
  'boq.result.none': 'No element is picked.',
  'boq.result.noQuantity': 'None of the {matched} picked elements declares {quantity}.',
  'boq.preview.title': 'Totals per article',
  'boq.preview.empty': 'Nothing to add up yet.',
  'boq.view.place': 'Place the summary on a sheet',
  'boq.view.placed': 'The summary is on sheet {number}.',
  'boq.view.noModel': 'Open a model to add the quantities up.',
} as const satisfies Record<string, TranslationValue>;
