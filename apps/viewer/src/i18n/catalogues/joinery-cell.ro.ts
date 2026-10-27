/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
import type { joineryCellEn } from './joinery-cell.en';

/** Ce spune cartela ferestrei despre o celulă a tabelului de tâmplărie aleasă pe planșă și scrisă peste (#446). Engleză: `joinery-cell.en.ts`. */
export const joineryCellRo: Record<keyof typeof joineryCellEn, TranslationValue> = {
  'joineryCell.title': 'Celule',
  'joineryCell.summary': 'Faceți clic pe o celulă ca să scrieți peste ea',
  'joineryCell.summaryPicked': '{row} la {type}',
  'joineryCell.hint': 'Faceți clic pe o celulă a tabelului din planșă ca să scrieți alt text peste cel din model. Apare pentru acel tip în toate tabelele de uși și ferestre.',
  'joineryCell.gone': 'Celula aleasă nu mai este în tabel. Alegeți alta.',
  'joineryCell.heading': '{row}: {type}',
  'joineryCell.model': 'Din model: {value}',
  'joineryCell.value': 'Textul de pe planșă',
  'joineryCell.overridden': 'Scris peste textul din model, în toate tabelele de uși și ferestre. Marcată pe planșă doar aici; tipărirea nu poartă marcaj.',
  'joineryCell.reset': 'Revino la valoarea din model',
  'joineryCell.done': 'Gata',
  'joineryCell.addColumn': 'Adăugați o coloană',
  'joineryCell.removeColumn': 'Scoateți coloana {name}',
  'joineryCell.tooManyRows': 'Prea multe proprietăți și cantități în tabel: eliminați mai întâi una.',
  'joineryRow.varies': 'diferă',
};
