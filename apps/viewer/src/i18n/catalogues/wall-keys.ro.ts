/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the Wall's keyboard settings (`wall-keys.en.ts`). Term choices: `../ro-glossary.md`. */
export const wallKeysRo = {
  'wall.keys.customise': 'Personalizați tastele',
  'wall.keys.title': 'Tastatură',
  'wall.keys.intro': 'Alegeți tasta sau combinația de taste care pornește fiecare acțiune. Tasta pornește acțiunea imediat, fără Enter. Tastele nu fac nimic cât timp scrieți într-un câmp.',
  'wall.keys.bareHint': 'O tastă fără Ctrl sau Alt pornește acțiunea doar cât timp linia de comandă este goală.',
  'wall.keys.done': 'Înapoi la comenzile rapide',
  'wall.keys.search': 'Căutați acțiuni',
  'wall.keys.searchEmpty': 'Nicio acțiune nu se potrivește cu „{query}”.',
  'wall.keys.category.wall': 'Pe planșă',
  'wall.keys.category.drafting': 'În timpul desenării',
  'wall.keys.none': 'Fără tastă',
  'wall.keys.changed': 'Modificată',
  'wall.keys.change': 'Schimbați',
  'wall.keys.changeAria': 'Schimbați tasta pentru {action}',
  'wall.keys.recording': 'Apăsați o tastă…',
  'wall.keys.recordingAria': 'Apăsați tasta sau combinația pentru {action}. Escape sau Tab anulează.',
  'wall.keys.remove': 'Eliminați',
  'wall.keys.removeAria': 'Eliminați tasta pentru {action}',
  'wall.keys.reset': 'Resetați',
  'wall.keys.resetAria': 'Readuceți {action} la tasta implicită',
  'wall.keys.resetAll': 'Resetați tot',
  'wall.keys.resetAllConfirm': 'Readuceți toate acțiunile la tastele implicite?',
  'wall.keys.keep': 'Păstrați tastele mele',
  'wall.keys.export': 'Exportați în fișier',
  'wall.keys.import': 'Importați din fișier',
  'wall.keys.importChoose': 'Alegeți un fișier de taste',
  'wall.keys.saved': '{action}: {keys}.',
  'wall.keys.conflict': '{keys} pornește deja {other}. Alegeți altă tastă sau schimbați mai întâi {other}.',
  'wall.keys.reserved': '{keys} mută între controale și nu poate porni o acțiune.',
  'wall.keys.removed': '{action} nu mai are tastă. Butonul ei o pornește în continuare.',
  'wall.keys.resetOne': '{action} are din nou tasta implicită.',
  'wall.keys.resetAllDone': 'Toate acțiunile au din nou tastele implicite.',
  'wall.keys.imported': { one: 'Au fost importate tastele unei acțiuni.', few: 'Au fost importate tastele a {count} acțiuni.', other: 'Au fost importate tastele a {count} de acțiuni.' },
  'wall.keys.importedNone': 'A fost importat un set cu toate acțiunile pe tastele implicite.',
  'wall.keys.importSkipped': { one: 'O acțiune din fișier nu există pe acest Panou și a fost omisă.', few: '{count} acțiuni din fișier nu există pe acest Panou și au fost omise.', other: '{count} de acțiuni din fișier nu există pe acest Panou și au fost omise.' },
  'wall.keys.importInvalid': 'Fișierul nu este un set de taste IfcSheet. Nu s-a schimbat nimic.',
  'wall.keys.importConflict': 'Fișierul dă tasta {keys} atât pentru {first}, cât și pentru {second}. Nu s-a schimbat nimic.',
  'wall.keys.action.back': 'Înapoi la Panou',
  'wall.keys.action.comment': 'Plasați un comentariu',
  'wall.keys.action.revisions': 'Revizii',
  'wall.keys.action.printPreview': 'Previzualizare la dimensiunea hârtiei',
  'wall.keys.action.exportDxf': 'Exportați DXF',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
