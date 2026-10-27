/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `hierarchy` (#526). Term choices: `../ro-glossary.md`. */
export const hierarchyRo = {
  'hierarchy.modelTagChip.removeAriaLabel': 'Eliminați eticheta {name}',
  'hierarchy.modelTagChip.unknownTag': 'Etichetă necunoscută',
  'hierarchy.modelTagChip.unresolvedTitle': 'Această etichetă nu mai există',
  'hierarchy.modelTagEditor.addAriaLabel': 'Adăugați o etichetă',
  'hierarchy.modelTagEditor.addPlaceholder': 'Adăugați o etichetă… (Enter)',
  'hierarchy.modelTagEditor.allModels': 'Toate cele {countDisplay} modele',
  'hierarchy.modelTagEditor.allTagsAriaLabel': 'Toate etichetele',
  'hierarchy.modelTagEditor.applyToAriaLabel': 'Se aplică la',
  'hierarchy.modelTagEditor.assign': 'Atribuie',
  'hierarchy.modelTagEditor.assignTagAriaLabel': 'Atribuiți eticheta {name}',
  'hierarchy.modelTagEditor.create': 'Creați',
  'hierarchy.modelTagEditor.deleteAriaLabel': 'Ștergeți eticheta {name}',
  'hierarchy.modelTagEditor.deleteTooltip': 'Ștergeți această etichetă peste tot. Filtrele salvate care o numesc o vor arăta ca nerezolvată.',
  'hierarchy.modelTagEditor.descriptionAll': 'Etichete pentru toate cele {countDisplay} modele. Etichetele servesc doar organizării — nu modifică niciodată fișierul IFC.',
  'hierarchy.modelTagEditor.descriptionCount': {
    one: "Etichete pentru {countDisplay} model. Etichetele servesc doar organizării — nu modifică niciodată fișierul IFC.",
    few: "Etichete pentru {countDisplay} modele. Etichetele servesc doar organizării — nu modifică niciodată fișierul IFC.",
    other: "Etichete pentru {countDisplay} de modele. Etichetele servesc doar organizării — nu modifică niciodată fișierul IFC.",
  },
  'hierarchy.modelTagEditor.descriptionNamed': 'Etichete pentru {name}. Etichetele servesc doar organizării — nu modifică niciodată fișierul IFC.',
  'hierarchy.modelTagEditor.descriptionThisModel': 'Etichete pentru acest model. Etichetele servesc doar organizării — nu modifică niciodată fișierul IFC.',
  'hierarchy.modelTagEditor.emptyState': 'Încă nicio etichetă — scrieți una mai sus.',
  'hierarchy.modelTagEditor.matchingTagsAriaLabel': 'Etichete potrivite',
  'hierarchy.modelTagEditor.removeTagAriaLabel': 'Eliminați eticheta {name}',
  'hierarchy.modelTagEditor.renameAriaLabel': 'Redenumiți eticheta {name}',
  'hierarchy.modelTagEditor.renameError': 'Numele este gol sau este folosit deja de altă etichetă.',
  'hierarchy.modelTagEditor.saveNameAriaLabel': 'Salvați numele pentru {name}',
  'hierarchy.modelTagEditor.selected': 'Selectate',
  'hierarchy.modelTagEditor.title': 'Etichete de model',
  'hierarchy.panel.title': 'Ierarhie',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
