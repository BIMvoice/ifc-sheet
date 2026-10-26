/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the review the "Exportă IFC modificat…" palette row opens (`ExportChangesReviewDialog.tsx`, mounted by
 * `ExportChangesButton.tsx`). Not `exportChangesButton.*`: those are the standing toolbar button and its tooltip, which the
 * face hides. Entity ids, type names and property names are model content. Term choices: `../ro-glossary.md`.
 */
export const exportChangesReviewRo = {
  'exportChangesReviewDialog.title': 'Revizuirea modificărilor',
  'exportChangesReviewDialog.kindAttribute': 'Atribut: {name}',
  'exportChangesReviewDialog.kindProperty': 'Proprietate: {set}.{name}',
  'exportChangesReviewDialog.kindQuantity': 'Cantitate: {set}.{name}',
  'exportChangesReviewDialog.kindPsetAdded': 'Set de proprietăți adăugat: {set}',
  'exportChangesReviewDialog.kindPsetDeleted': 'Set de proprietăți șters: {set}',
  'exportChangesReviewDialog.kindQsetAdded': 'Set de cantități adăugat: {set}',
  'exportChangesReviewDialog.kindQsetDeleted': 'Set de cantități șters: {set}',
  'exportChangesReviewDialog.kindType': 'Tipul entității',
  'exportChangesReviewDialog.kindEntityAdded': 'Entitate creată',
  'exportChangesReviewDialog.kindEntityDeleted': 'Entitate ștearsă',
  'exportChangesReviewDialog.entityFallback': 'entitate',
  'exportChangesReviewDialog.unknownTypeFallback': 'Necunoscut',
  'exportChangesReviewDialog.newEntityLabel': '{type} nou #{id}',
  'exportChangesReviewDialog.entityIdLabel': '#{id}',
  'exportChangesReviewDialog.entityTypeIdLabel': '{type} #{id}',
  'exportChangesReviewDialog.entityTypeIdNameLabel': '{type} #{id} — {name}',
  'exportChangesReviewDialog.noPendingChanges': 'Nu există modificări în așteptare de exportat.',
  'exportChangesReviewDialog.modelsCount': {
    one: 'un model',
    few: '{count} modele',
    other: '{count} de modele',
  },
  'exportChangesReviewDialog.changesSummary': {
    one: 'O modificare din {models} va fi aplicată fișierului exportat{fileSuffix}.',
    few: '{count} modificări din {models} vor fi aplicate fișierului exportat{fileSuffix}.',
    other: '{count} de modificări din {models} vor fi aplicate fișierului exportat{fileSuffix}.',
  },
  'exportChangesReviewDialog.emptyStateMessage': 'Nimic nu s-a schimbat de la ultimul export, deci nu există nicio suprapunere de aplicat.',
  'exportChangesReviewDialog.noneValue': '(niciuna)',
  'exportChangesReviewDialog.deletedValue': '(ștearsă)',
  'exportChangesReviewDialog.unitemizedNote': {
    one: '+ o modificare de georeferențiere sau de program (nedetaliată mai sus)',
    few: '+ {count} modificări de georeferențiere sau de program (nedetaliate mai sus)',
    other: '+ {count} de modificări de georeferențiere sau de program (nedetaliate mai sus)',
  },
  'exportChangesReviewDialog.cancelButton': 'Anulează',
  'exportChangesReviewDialog.exportingLabel': 'Se exportă...',
  'exportChangesReviewDialog.exportButton': 'Exportă',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
