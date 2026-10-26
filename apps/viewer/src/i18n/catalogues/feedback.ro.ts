/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the feedback dialog the IfcSheet top bar opens (`FeedbackButton`). The report is a public
 * GitHub issue, so the text says so plainly. Term choices: `../ro-glossary.md`.
 */
export const feedbackRo = {
  'feedback.button': 'Feedback',
  'feedback.title': 'Raportați o problemă sau propuneți ceva',
  'feedback.kind': 'Ce este',
  'feedback.kind.bug': 'Eroare',
  'feedback.kind.suggestion': 'Sugestie',
  'feedback.kind.question': 'Întrebare',
  'feedback.field.title': 'Titlu',
  'feedback.field.description': 'Descriere',
  'feedback.descriptionPlaceholder': 'Ce s-a întâmplat, ce vă așteptați să se întâmple și pașii prin care se ajunge acolo.',
  'feedback.attach': 'Atașați contextul',
  'feedback.attach.environment': 'Versiunea aplicației, browserul, sistemul și suportul WebGPU',
  'feedback.attach.place': 'Unde vă aflați: numărul planșei, felul vederii și instrumentul activ',
  'feedback.never': 'Nu se atașează niciodată: modelul, numele fișierelor, numele elementelor, identificatorii, valorile proprietăților, numele planșelor și ale vederilor. Pleacă doar ce scrieți aici și părțile bifate.',
  'feedback.preview': 'Ce va fi completat',
  'feedback.truncated': 'Descrierea este mai lungă decât poate duce un link GitHub, așa că este tăiată la sfârșit. Lipiți restul în raportul deschis.',
  'feedback.opens': 'Butonul „Deschide GitHub” deschide o filă nouă cu acest raport completat. Aveți nevoie de un cont GitHub ca să-l trimiteți, iar raportul este public în depozitul IfcSheet. IfcSheet nu trimite nimic de la sine, nu păstrează nicio autentificare GitHub, iar acest formular nu înregistrează statistici de utilizare.',
  'feedback.cancel': 'Anulare',
  'feedback.send': 'Deschide GitHub',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
