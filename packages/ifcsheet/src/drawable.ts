/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one rule for "this model can be drawn" (#604): it has an extent, the box the sheets are measured on. A set is
 * laid out only for such a model (`generateDefaultSet`), and the readiness report says so when it is not
 * (`readinessOfModel`), so `check` and `build` cannot disagree about it.
 */
export function hasDrawableGeometry(model: { extent: unknown }): boolean {
  return model.extent !== null && model.extent !== undefined;
}
