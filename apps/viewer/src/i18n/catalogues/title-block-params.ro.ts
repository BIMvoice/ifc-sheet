/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for `title-block-params.en.ts` and the parameter text tool (#143). Term choices: `../ro-glossary.md`.
 * Parameter names in braces (`{Revision}`, `{Phase}`) are names a text refers to, not words: they stay as they are.
 */
export const titleBlockParamsRo = {
  'wall.draw.ptext': 'Text cu parametri',
  'wall.draw.ptext.body': 'Faceți clic unde se așază pe planșă și scrieți textul. Puneți numele unui parametru între acolade pentru a-i tipări valoarea.',
  'tbparams.title': 'Parametri',
  'tbparams.hint': 'Dați o dată un nume unei valori, apoi scrieți {token} în orice text din cartuș sau de pe planșă pentru a o tipări. O planșă poate avea propria valoare.',
  'tbparams.builtin': 'Predefinite, completate de program: {names}',
  'tbparams.none': 'Încă nu există parametri.',
  'tbparams.add': 'Adaugă un parametru',
  'tbparams.name': 'Numele parametrului',
  'tbparams.value': 'Valoarea lui {name}',
  'tbparams.delete': 'Șterge parametrul {name}',
  'tbparams.problem.empty': 'Un parametru are nevoie de un nume.',
  'tbparams.problem.invalid': 'Folosiți o literă, apoi litere, cifre sau liniuțe de subliniere.',
  'tbparams.problem.builtin': 'Numele este predefinit.',
  'tbparams.problem.duplicate': 'Un alt parametru are deja acest nume.',
  'tbparams.sheetHint': 'Valorile proprii ale acestei planșe pentru parametri. Unul lăsat neschimbat urmează proiectul.',
  'tbparams.ownValue': 'doar pe această planșă',
  'tbparams.useProject': 'Ca pe toate planșele',
  'tbparams.text.prompt': 'Scrieți textul, cu {token} unde vine un parametru',
  'tbparams.text.sheetOnly': 'Textul cu parametri se așază pe hârtia unei planșe. Deschideți o planșă și folosiți-l acolo.',
  'tblayout.title': 'Machetă',
  'tblayout.intro': 'Fiecare planșă tipărește macheta standard. Modificați-o pentru a-i muta liniile și textele sau adăugați-le pe ale dumneavoastră; macheta modificată se salvează cu proiectul și o tipărește fiecare planșă.',
  'tblayout.edit': 'Modifică macheta',
  'tblayout.reset': 'Revenire la macheta standard',
  'tblayout.resetSure': 'Renunțați la modificările machetei?',
  'tblayout.resetYes': 'Da, revino',
  'tblayout.resetNo': 'Păstrează-le',
  'tblayout.add.line': 'Adaugă o linie',
  'tblayout.add.rect': 'Adaugă un dreptunghi',
  'tblayout.add.text': 'Adaugă un text',
  'tblayout.add.logo': 'Adaugă cadrul siglei',
  'tblayout.kind.line': 'Linie',
  'tblayout.kind.rect': 'Dreptunghi',
  'tblayout.kind.text': 'Text',
  'tblayout.kind.logo': 'Cadrul siglei',
  'tblayout.item': '{kind} {n}',
  'tblayout.field.x': 'x',
  'tblayout.field.y': 'y',
  'tblayout.field.x1': 'x1',
  'tblayout.field.y1': 'y1',
  'tblayout.field.x2': 'x2',
  'tblayout.field.y2': 'y2',
  'tblayout.field.w': 'lățime',
  'tblayout.field.h': 'înălțime',
  'tblayout.field.weight': 'peniță',
  'tblayout.field.size': 'înălțimea literei',
  'tblayout.field.fit': 'lățime de încadrare',
  'tblayout.field.text': 'text',
  'tblayout.field.bold': 'aldin',
  'tblayout.field.muted': 'gri',
  'tblayout.unit': 'Milimetri din colțul stânga sus al cartușului.',
  'tblayout.noFit': 'Nu micșora',
  'tblayout.remove': 'Elimină {item}',
  'tblayout.invalid': 'Valoare inutilizabilă. Doar numere; penițele, înălțimile și lățimile peste zero.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
