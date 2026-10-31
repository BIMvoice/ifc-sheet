/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for `annotate-all.en.ts` (#314): what DIMALL, TAGALL, CEILTAG and LEVELALL
 * say when they are done, and why they sometimes do nothing. The command names stay as
 * typed. A figure that counts several kinds of thing follows a colon, so no noun has to
 * agree with it; a figure that counts one kind has Romanian plural forms. Term choices:
 * `../ro-glossary.md`.
 */
export const annotateAllRo = {
  'drafting.cmd.dimAll': 'DIMALL',
  'drafting.cmd.tagAll': 'TAGALL',
  'drafting.cmd.ceilTag': 'CEILTAG',
  'drafting.cmd.levelAll': 'LEVELALL',

  'drafting.msg.dimAllPlanOnly': 'DIMALL funcționează pe un plan.',
  'drafting.msg.dimAllNotOnDetail': 'DIMALL funcționează pe un plan întreg: un detaliu arată doar o parte din clădire, deci marginile lui nu sunt fațade. Rulați-l pe planul de origine sau cotați detaliul manual.',
  'drafting.msg.dimAllNone': 'Nimic de cotat: acest plan nu are pereți tăiați sau nicio fațadă cu un gol sau cu un perete transversal.',
  'drafting.msg.dimAllHave': 'Acest plan are deja toate șirurile de cote.',
  'drafting.msg.dimAllDone': 'Cote adăugate: {count}, grupate în șiruri de cote: {strings}. Fațade fără nimic de cotat: {skipped}.',
  'drafting.msg.dimAllDropped': {
    one: 'Un șir de cote a fost lăsat deoparte: pe o fațadă cu retragere sau curte interioară ar trece prin clădire, peste încăperi și etichete. Cotați acei pereți manual.',
    few: '{count} șiruri de cote au fost lăsate deoparte: pe o fațadă cu retragere sau curte interioară ar trece prin clădire, peste încăperi și etichete. Cotați acei pereți manual.',
    other: '{count} de șiruri de cote au fost lăsate deoparte: pe o fațadă cu retragere sau curte interioară ar trece prin clădire, peste încăperi și etichete. Cotați acei pereți manual.',
  },
  'drafting.msg.dimAllHeads': {
    one: 'Un șir de cote trece prin săgeata sau litera unui marcaj de secțiune; cifrele lui rămân libere, dar poate doriți să mutați marcajul.',
    few: '{count} șiruri de cote trec prin săgeata sau litera unui marcaj de secțiune; cifrele lor rămân libere, dar poate doriți să mutați marcajul.',
    other: '{count} de șiruri de cote trec prin săgeata sau litera unui marcaj de secțiune; cifrele lor rămân libere, dar poate doriți să mutați marcajul.',
  },

  'drafting.msg.ceilTagCeilingPlanOnly': 'CEILTAG funcționează pe un plan de plafoane (reflectat).',
  'drafting.msg.ceilTagDone': 'Plafoane etichetate cu înălțimea lor față de nivel: {count}. Deja etichetate: {already}.',
  'drafting.msg.ceilTagStacked': 'Plafoane care împart eticheta altuia, aflate exact sub el (același loc, aceeași înălțime): {stacked}. Etichete în total: {tags}.',
  'drafting.msg.ceilTagNone': 'Fiecare plafon al acestui plan are deja înălțimea ({already}) sau planul nu are plafoane.',

  'drafting.msg.tagAllPlanOnly': 'TAGALL funcționează pe un plan.',
  'drafting.msg.tagAllNeedsTypes': 'TAGALL are nevoie de tipurile de etichetă „Door and window mark” și „Room name and area”; restaurați-le în dialogul Standards.',
  'drafting.msg.tagAllDone': 'Etichetate: uși și ferestre: {marks}, încăperi: {rooms}. Deja etichetate: {already}.',
  'drafting.msg.tagAllHave': 'Fiecare ușă, fereastră și încăpere din acest plan are deja eticheta ({already}).',
  'drafting.msg.tagAllNumbered': {
    one: 'O ușă sau o fereastră nu are nici Tag, nici Name în model; instrumentul a numerotat-o.',
    few: '{count} uși și ferestre nu au nici Tag, nici Name în model; instrumentul le-a numerotat.',
    other: '{count} de uși și ferestre nu au nici Tag, nici Name în model; instrumentul le-a numerotat.',
  },
  'drafting.msg.tagAllAreas': 'Ariile încăperilor: {model} citite din cantitățile modelului, {footprint} calculate din conturul încăperii.',
  'drafting.msg.tagAllTooSmall': {
    one: 'O încăpere este mai mică decât eticheta ei; eticheta stă în punctul cel mai adânc și trece peste pereți.',
    few: '{count} încăperi sunt mai mici decât etichetele lor; etichetele stau în punctul cel mai adânc și trec peste pereți.',
    other: '{count} de încăperi sunt mai mici decât etichetele lor; etichetele stau în punctul cel mai adânc și trec peste pereți.',
  },
  'drafting.msg.tagAllNoRooms': 'Acest plan nu arată nicio încăpere: modelul nu are niciun spațiu tăiat la acest nivel, deci au fost etichetate doar ușile și ferestrele.',

  'drafting.msg.levelAllViewOnly': 'LEVELALL funcționează pe o secțiune sau pe o fațadă.',
  'drafting.msg.levelAllEmpty': 'Nimic de marcat: această vedere nu arată niciun element al modelului.',
  'drafting.msg.levelAllHave': 'Această vedere are deja toate cotele de nivel ({count}).',
  'drafting.msg.levelAllDoneLeft': 'Cote de nivel adăugate în stânga clădirii, aliniate: {count}. Deja existente: {already}.',
  'drafting.msg.levelAllDoneRight': 'Cote de nivel adăugate în dreapta clădirii, aliniate: {count}. Deja existente: {already}.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
