/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where each title block field gets its value: moved to the engine package
 * (`packages/ifcsheet/src/title-block-sources.ts`) so the PDF and the command
 * line resolve the fields from the IFC the way the sheet does. Re-exported
 * here so the app's imports stay as they were.
 */

export {
  DEFAULT_SOURCES, effectiveFields, fieldsWithoutSource, isPlaceholder, MODEL_ENTITIES, OWNER_PARTS, PRESET_SOURCES, projectNameFromFile, readTitleSources, resolveField, resolveTitleBlock,
  sameSource, sourcesOf, sourceText, withSources,
  type ModelEntity, type TitleBlockFacts as ModelFacts, type OwnerPart, type ResolvedField, type TitleSource, type TitleSources,
} from '@bimvoice/ifcsheet';
