/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Moved to the engine package (`packages/ifcsheet/src/readiness.ts`, #164): one implementation for the app, the command line and the MCP tool. Re-exported so the app's imports stay as they were. */

export { modelReadiness } from '@bimvoice/ifcsheet/readiness';
export type { ModelFacts, ReadinessFinding, ReadinessKind } from '@bimvoice/ifcsheet/readiness';
