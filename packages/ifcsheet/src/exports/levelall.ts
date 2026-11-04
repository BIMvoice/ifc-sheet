/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** LEVELALL as a pure function (#707): the level marks of a section or elevation planned from plain inputs. Add new exports of this area here, not in `../index.ts`. */

export { planLevelAll, type LevelAllInputs, type LevelAllKey, type LevelAllMessage, type LevelAllResult } from '../levelall/levelall.js';
export { planLevels, LEVEL_OFFSET_MM, type LevelShape, type LevelsInput, type LevelsPlan, type PlannedLevel } from '../levelall/plan.js';
