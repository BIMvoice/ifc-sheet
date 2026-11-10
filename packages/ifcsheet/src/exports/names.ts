/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** Names: the engine's words, the name resolver, sheet numbers and the locale. Add new exports of this area here, not in `../index.ts`. */

// Names
export { ENGINE_NAMES_EN, ENGINE_NAMES_RO, NAME_LANGUAGES, englishName, NAME_LANGUAGES_TEXT, nameLanguageOf, nameOf, nameResolverFor, readProjectLanguage, unknownLanguageMessage, unknownLocaleMessage, setNameResolver, withNameLanguage, type NameLanguage, type ProjectLanguageRead, type EngineNameKey, type NameParams, type NameResolver } from '../names.js';
export { sheetNumber, sheetLevel, sheetFormat, readUnitsAndNumbers, type SheetLocale, type SheetFormat, type UnitsAndNumbers } from '../names.js';
export { CLASS_WORDS_RO, classLabel, plainClass, type ClassWordKey } from '../class-words.js';
