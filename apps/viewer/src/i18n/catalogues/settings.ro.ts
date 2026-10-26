/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the Settings dialog. The IfcSheet face reaches it from the privacy notice's action
 * (`settings.privacy.toastAction`), and the dialog lists all of its sections. Term choices: `../ro-glossary.md`.
 */
export const settingsRo = {
  'settings.title': 'Setări',
  'settings.description': 'Salvate în acest browser.',
  'settings.sections.general': 'General',
  'settings.sections.display': 'Afișare',
  'settings.sections.performance': 'Performanță',
  'settings.sections.privacy': 'Confidențialitate',
  'settings.sections.collaboration': 'Colaborare',
  'settings.general.appearanceTitle': 'Aspect',
  'settings.general.theme': 'Temă',
  'settings.general.themeLight': 'Luminoasă',
  'settings.general.themeDark': 'Întunecată',
  'settings.general.helpersTitle': 'Ajutoare',
  'settings.general.hoverTooltips': 'Sfaturi la trecerea cursorului',
  'settings.general.hoverTooltipsHint': 'Arată numele și clasa unui element sub cursor.',
  'settings.display.navigationTitle': 'Navigare',
  'settings.display.navigationPreset': 'Comenzi pentru cursor și rotiță',
  'settings.display.preset.default': 'Implicit',
  'settings.display.preset.navisworks': 'Ca în Navisworks',
  'settings.display.preset.trackpad': 'Trackpad',
  'settings.display.presetHint.default': 'Rotița mărește și micșorează; mișcarea orizontală a rotiței deplasează vederea.',
  'settings.display.presetHint.navisworks': 'Shift + tragere cu butonul din mijloc rotește; rotița mărește și micșorează.',
  'settings.display.presetHint.trackpad': 'Derularea cu două degete deplasează vederea; ciupirea sau Ctrl + rotiță mărește și micșorează.',
  'settings.display.performanceTitle': 'Performanță',
  'settings.display.performanceStats': 'Arată statisticile de performanță',
  'settings.display.performanceStatsHint': 'Arată FPS-ul, memoria folosită și numărul de triunghiuri în bara de stare.',
  'settings.display.spaceMouseTitle': 'SpaceMouse',
  'settings.performance.overridesTitle': 'Valori geometrice fixate',
  'settings.performance.overridesHint': 'Aceste valori se aplică la următoarea încărcare a unui model. „Resetează” revine la alegerea automată.',
  'settings.performance.noOverrides': 'Nicio valoare fixată nu este activă.',
  'settings.performance.geometryTier': 'Detaliul geometriei',
  'settings.performance.geometryWorkers': 'Fire de execuție pentru geometrie',
  'settings.performance.sourceUrl': 'Din acest URL',
  'settings.performance.sourceSaved': 'Salvat în acest browser',
  'settings.performance.tierIgnoredInExact': 'Detaliul redus este ignorat în modul exact.',
  'settings.performance.workersMayClamp': 'Modificările se aplică la următoarea încărcare a unui model. Motorul poate reduce acest număr pentru a încăpea în memorie.',
  'settings.performance.resetNamed': 'Resetează {name}',
  'settings.performance.reset': 'Resetează',
  'settings.privacy.analyticsTitle': 'Statistici de utilizare',
  'settings.privacy.analyticsDisclosure': 'Versiunea găzduită trimite evenimente anonime de utilizare și de eroare, cum ar fi comanda folosită, schema modelului, numărătorile și versiunea aplicației.',
  'settings.privacy.analyticsExclusions': 'Conținutul modelului, numele fișierelor, GlobalId-urile, valorile proprietăților, textul din chat și cheile API nu sunt incluse niciodată.',
  'settings.privacy.analyticsOff': 'Această versiune nu trimite evenimente de utilizare sau de eroare. Statisticile există doar într-o versiune configurată cu o cheie de statistici.',
  'settings.privacy.analyticsOptOut': 'Renunț la statisticile de utilizare',
  'settings.privacy.analyticsOptOutHint': 'Oprește evenimentele de utilizare și de eroare din acest browser.',
  'settings.privacy.learnMore': 'Citiți ghidul de confidențialitate',
  'settings.collaboration.identityTitle': 'Identitatea dumneavoastră',
  'settings.collaboration.displayName': 'Nume afișat',
  'settings.collaboration.displayNameHint': 'Se arată celorlalți într-o sesiune comună.',
  'settings.collaboration.saveName': 'Salvează numele',
  'settings.collaboration.emptyName': 'Introduceți un nume afișat.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
