/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The order the file reader read the fields in before each had its own reader (#144). It is frozen, and a new
 * field does not go in it: the fields it does not name are read after these, in registry order.
 *
 * It matters twice. The reader throws on the first problem it meets, so the order decides which of two bad
 * fields a file is refused for. And the parsed document keeps the order its keys were read in, which is what
 * `projectFingerprint` hashes, so changing it would make every project saved before look edited once.
 */
export const READ_ORDER: readonly string[] = [
  'name', 'models', 'views', 'sheets', 'titleBlock', 'titleBlockSources', 'titleBlockParams', 'titleBlockTemplate', 'drafts', 'draftLayers',
  'hatchPatterns', 'symbolFlips', 'openingLines', 'graphicStandard', 'textStyles', 'dimStyles', 'layerGroups', 'joineryTypes', 'currentJoinery',
  'joineryMapping', 'elementTypes', 'currentTypes', 'schedules', 'structureProfiles', 'civilDrawings', 'typicalSections', 'materials',
  'cadLayers', 'savedSectionCuts', 'phaseSource', 'annotationTypes', 'symbols', 'legends', 'details', 'issues', 'sheetTemplates',
  'seriesTemplates', 'viewTemplates', 'sheetNumbering', 'tagFields', 'comments', 'revisions', 'modelState', 'siteArea', 'urbanSettings',
  'includeFarElements', 'boqArticles', 'handoverPattern', 'unitsAndNumbers',
];
