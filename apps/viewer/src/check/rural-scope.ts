/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether the loaded model is inside what the simplified permit project covers (Legea 169/2026 Anexa 3: P + M, 150 m² Sd). The rule and
 * its limits are the engine's (`rural-scope.ts` measures, `ruralReadiness` in `readiness.ts` judges), the same ones `ifcsheet check`
 * runs; this reads the app's urban indicators through them. The findings are readiness findings: the "What the model lacks" list and
 * the PAC drawer both show them.
 */

import { ruralReadiness } from '@bimvoice/ifcsheet';
import { ruralScopeOf } from '@bimvoice/ifcsheet/urban';
import type { UrbanIndicators } from '@/urban/indicators';
import type { ReadinessFinding } from './readiness';

/** What is outside Anexa 3's scope in the model whose indicators are `result`; empty when it is inside (or nothing is measured). */
export const ruralScopeFindings = (result: UrbanIndicators): ReadinessFinding[] => ruralReadiness(ruralScopeOf(result));
