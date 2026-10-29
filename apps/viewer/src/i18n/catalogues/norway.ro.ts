/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `norway.en.ts`. Term choices: `../ro-glossary.md`. */
export const norwayRo = {
  'norway.title': 'Norvegia (byggesak)',
  'norway.intro': 'Piesele desenate ale unei cereri de construire din Norvegia, SAK10 § 5-4: „tegninger og målsatt situasjonsplan”. Fiecare punct indică sursa. Punctele marcate neverificate nu rezultă din paginile oficiale citite.',
  'norway.set.name': 'Norvegia (byggesak)',
  'norway.set.plans': 'Planuri de nivel (plantegninger)',
  'norway.set.sections': 'Secțiuni (snitt)',
  'norway.set.facades': 'Fațade (fasadetegninger)',
  'norway.set.site': 'Plan de situație (situasjonsplan)',
  'norway.set.siteScale': 'Scara 1:500 este uzuală; regulamentul nu fixează una.',
  'norway.set.siteToAdd': 'Parcela, distanțele și terenul trebuie desenate (tomt, avstander og terreng), cu o săgeată de nord și o scară grafică.',
  'norway.item.plans': 'Planurile tuturor nivelurilor, la 1:100',
  'norway.item.roomUse': 'Suprafețele și destinația fiecărei încăperi pe planuri',
  'norway.item.sections': 'Secțiuni longitudinale și transversale, la 1:100',
  'norway.item.floorHeights': 'Înălțimea fiecărui nivel pe secțiuni',
  'norway.item.facades': 'Fațadele tuturor laturilor, la 1:100',
  'norway.item.facadeTerrain': 'Terenul din jurul clădirii înainte și după lucrări, pe fațade',
  'norway.item.mainDimensions': 'Dimensiunile principale (hovedmål) pe planuri și secțiuni',
  'norway.item.sitePlan': 'Planșa planului de situație (målsatt situasjonsplan), doar secțiunea orizontală a parterului: cotați-o pe baza situasjonskart al primăriei',
  'norway.item.siteDistances': 'Pe planul de situație: distanța minimă la limita proprietății, la axul drumului, la cea mai apropiată clădire de pe parcelă și la cea mai apropiată clădire vecină',
  'norway.item.terrainLines': 'Linii noi de teren (nye terrenglinjer) pe planul de situație',
  'norway.item.neighbourNotice': 'Plan de situație, secțiuni și fațade anexate notificării vecinilor',
  'norway.item.eaveRidgeHeights': 'Înălțimea la cornișă și la coamă marcată pe secțiuni și fațade',
  'norway.source': 'Sursa: {source}',
  'norway.read': 'Citit în textul oficial',
  'norway.unverified': 'Neverificat',
  'norway.scale': 'Desenat la 1:{scale}',
  'norway.scaleUnverified': 'Desenat la 1:{scale}; scara este neverificată',
  'norway.drawn': 'Desenat din model',
  'norway.supply': 'De adăugat',
  'norway.missingLevels': 'Niciun plan pe o planșă pentru: {list}',
  'norway.siteNote': 'Scara planului de situație nu este fixată în textul citit; 1:500 este cea uzuală și este aici o valoare implicită, nu o regulă. Primăriile pot cere mai mult.',
  'norway.useSet': 'Folosește planșele pentru Norvegia la un proiect nou',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
