/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';
import { PAC_WORDS_RO } from '@bimvoice/ifcsheet/pac-words';

/** Romanian for `pac.en.ts`. Term choices: `../ro-glossary.md`. */
export const pacRo = {
  ...PAC_WORDS_RO,
  'pac.title': 'Proiect pentru autorizarea construirii (PAC), Legea 169/2026',
  'pac.intro': 'Conținutul proiectului pentru autorizarea construirii, cum îl enumeră Anexa 2 la Legea 169/2026. DTAC este denumirea de dinainte de 25 august 2026.',
  'pac.drawn': 'Desenat din model',
  'pac.supply': 'De furnizat',
  'pac.point': 'Anexa 2, {point}',
  'pac.scales': 'Scara 1:{list}, după caz',
  'pac.scales.adequate': 'Scară: „o scară adecvată”, textul nu indică una',
  'pac.kind.drawing': 'Piese desenate',
  'pac.kind.written': 'Piese scrise',
  'pac.kind.existingBuilding': 'Lucrări la o clădire existentă',
  'pac.notSet': 'Nu rezultă din text, deci nu este stabilit aici: formatul planșelor și ordinea lor.',
  'pac.submit': 'Generează PDF-ul de depunere',
  'pac.intervention': 'Lucrările',
  'pac.intervention.new': 'Construcție nouă',
  'pac.intervention.existing': 'Intervenție la o clădire existentă',
  'pac.intervention.interior': 'Intervenție numai la interior',
  'pac.na': 'Nu este cazul',
  'pac.missingLevels': 'Niciun plan pe o planșă pentru: {list}',
  'pac.submit.hint': 'Înregistrează o emitere a setului (planșele așa cum sunt acum) și descarcă două fișiere: PDF-ul de depunere și lista planșelor ca CSV. PDF-ul conține opisul (conținutul de mai sus, fiecare piesă cu punctul din Anexa 2 și cu mențiunea dacă fișierul o conține), apoi planșele în ordinea setului. Textul nu indică formatul hârtiei, ordinea planșelor și nici regulile de fișiere pentru platforma electronică, deci nu se aplică niciuna.',
  'pac.submit.working': 'Se generează PDF-ul de depunere…',
  'pac.useSet': 'Folosește planșele PAC pentru un proiect nou',
  'pac.mode.label': 'Model',
  'pac.mode.standard': 'PAC (Anexa 2)',
  'pac.mode.rural': 'PAC simplificat, locuință rurală (Anexa 3)',
  'pac.rural.intro': 'Conținutul simplificat pentru o locuință unifamilială în mediul rural (cel mult P + M, cel mult 150 mp suprafață construită desfășurată), cum îl enumeră Anexa 3 la Legea 169/2026.',
  'pac.rural.point': 'Anexa 3, {point}',
  'pac.rural.notSet': 'Nu rezultă din text, deci nu este stabilit aici: formatul planșelor și ordinea lor. Fiecare desen are planșa lui, A3 la scara 1:50; un desen care nu încape pe A3 la 1:50 (o clădire mai mare decât cea vizată de Anexa 3) mută planșa respectivă pe A2, apoi A1. Scara nu se schimbă niciodată pentru a economisi hârtie.',
  'pac.rural.scales': 'Scara 1:{list}',
  'pac.useRuralSet': 'Folosește planșele PAC simplificat (1:50) pentru un proiect nou',
  'pac.rural.set.name': 'PAC simplificat',
  'pac.item.rural.siteLocation': 'Plan de încadrare în zonă',
  'pac.item.rural.situationExisting': 'Plan de situație, situația actuală',
  'pac.item.rural.situationProposed': 'Plan de situație, situația propusă',
  'pac.item.rural.utilities': 'Plan de situație cu marcarea lucrărilor de branșamente și racorduri',
  'pac.item.rural.plans': 'Planurile tuturor nivelurilor, cu funcțiunea fiecărui spațiu',
  'pac.item.rural.roof': 'Planuri acoperiș',
  'pac.item.rural.facades': 'Fațade',
  'pac.item.rural.sections': 'Secțiuni principale, cu profilul terenului',
  'pac.item.rural.context': 'Documentații grafice și fotografice: vecinătăți, peisaj, impact vizual',
  'pac.item.rural.fencePlans': 'Planurile împrejmuirii, cu materiale și cromatică și firidele pentru echipamentele tehnice',
  'pac.item.rural.memo': 'Memoriu-sinteză',
  'pac.item.rural.survey': 'Releveul detaliat al situației existente',
  'pac.item.rural.structuralExpertise': 'Evaluare/expertiză tehnică privind rezistența și stabilitatea',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
