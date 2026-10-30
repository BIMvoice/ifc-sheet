/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The front, plan and section views of one door or window, cut from its mesh. Lives in the engine (`@bimvoice/ifcsheet`, `joinery-element-views.ts`), one copy for the app and the engine; re-exported for the app's imports. */

export { placedMeshes } from '@bimvoice/ifcsheet';
export {
  elementFrame, elementViews,
  type ElementView, type ElementViewOptions, type ElementViews, type V2, type ViewLine, type ViewLineKind,
} from '@bimvoice/ifcsheet/project';
