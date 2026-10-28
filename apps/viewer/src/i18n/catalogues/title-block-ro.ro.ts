/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TITLE_BLOCK_CAPTIONS_RO } from '@bimvoice/ifcsheet';
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `title-block-ro.en.ts`. Term choices: `../ro-glossary.md`. */
export const titleBlockRoRo = {
  'tbro.generalDesigner': TITLE_BLOCK_CAPTIONS_RO['tbro.generalDesigner'],
  'tbro.registration': TITLE_BLOCK_CAPTIONS_RO['tbro.registration'],
  'tbro.projectTitle': TITLE_BLOCK_CAPTIONS_RO['tbro.projectTitle'],
  'tbro.projectManager': TITLE_BLOCK_CAPTIONS_RO['tbro.projectManager'],
  'tbro.designer': TITLE_BLOCK_CAPTIONS_RO['tbro.designer'],
  'tbro.professionalTitle': TITLE_BLOCK_CAPTIONS_RO['tbro.professionalTitle'],
  'tbro.signature': TITLE_BLOCK_CAPTIONS_RO['tbro.signature'],
  'tbro.capacity': TITLE_BLOCK_CAPTIONS_RO['tbro.capacity'],
  'tbro.verifier': TITLE_BLOCK_CAPTIONS_RO['tbro.verifier'],
  'tbro.verifierCapacity': TITLE_BLOCK_CAPTIONS_RO['tbro.verifierCapacity'],
  'tbro.requirement': TITLE_BLOCK_CAPTIONS_RO['tbro.requirement'],
  'tbro.report': TITLE_BLOCK_CAPTIONS_RO['tbro.report'],
  'tbro.reportDate': TITLE_BLOCK_CAPTIONS_RO['tbro.reportDate'],
  'tbro.phase': TITLE_BLOCK_CAPTIONS_RO['tbro.phase'],
  'tbro.projectNumber': TITLE_BLOCK_CAPTIONS_RO['tbro.projectNumber'],
  'tbro.sheetNumber': TITLE_BLOCK_CAPTIONS_RO['tbro.sheetNumber'],
  'tblayout.useRo': 'Folosește cartușul pentru România',
  'tblayout.roHint': 'Cartușul din Ordinul 975/2026 (modelul F_01): firma și numărul de înmatriculare, faza, numerele proiectului și ale planșei, rolurile care semnează cu titlul profesional și câte un chenar gol pentru semnătură, cerința și referatul verificatorului. Înlocuiește macheta de acum (anularea o readuce) și rămâne modificabilă.',
  'tblayout.import': 'Importă un cartuș DXF sau SVG',
  'tblayout.import.label': 'Fișier cu cartușul (DXF sau SVG)',
  'tblayout.import.hint': 'Liniile și textul fix ale propriului cartuș devin această machetă, la mărime reală după unitățile din DXF (milimetri dacă nu declară nimic), micșorate doar dacă depășesc 180 x 50 mm. Un SVG este citit din linii, dreptunghiuri, trasee și text; CSS, transformările și curbele nu. Apoi așază câmpurile pe el, mai jos.',
  'tblayout.import.refused': 'Nu s-a importat: {reason}',
  'tblayout.field.pick': 'Câmpul cartușului de așezat',
  'tblayout.field.place': 'Așază câmpul',
  'tblayout.pack.save': 'Salvează ca element de bibliotecă (.bvlib)',
  'tblayout.pack.name': 'Cartuș propriu',
  'wall.tb.projectManagerTitle': 'Șef proiect: titlu profesional',
  'wall.tb.designerTitle': 'Proiectat: titlu profesional',
  'wall.tb.drawnByTitle': 'Desenat: titlu profesional',
  'wall.tb.verifierCapacity': 'Verificator / expert: calitatea',
  'wall.tb.phaseHint': 'de ex. PAC, PTh, DE (DTAC este denumirea veche a PAC)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
