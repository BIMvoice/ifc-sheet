/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hatch patterns (AutoCAD `.pat`): the parser, the built-in library and the fill that turns a pattern and a region into strokes. The
 * engine owns them so the app (screen, sheet, DXF) and the headless sheets (PDF, DXF) lay one pattern out the same way (#493).
 */

export { parsePat, serializePat, type HatchLineFamily, type HatchPattern } from './pattern.js';
export { hatchSegments, type HatchOptions, type HatchResult, type HatchSegment } from './fill.js';
export { builtInPatterns, findPattern } from './library.js';
export type { Pt } from './pt.js';
