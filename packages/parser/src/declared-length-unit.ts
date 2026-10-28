/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Length unit scales a model's reader has DECLARED, by `entityIndex`: for a
 * format with no `IfcProject`/`IfcUnitAssignment` to read (IFCX), where
 * {@link extractLengthUnitScale} would otherwise find no `IFCPROJECT` and
 * answer an unconfirmed 1.0 with a warning. See {@link declareLengthUnitScale}.
 */
const declaredScales = new WeakMap<object, number>();

/**
 * Record the length unit scale a non-STEP model's format defines, so every
 * caller of {@link extractLengthUnitScale} (about twenty read the unit from
 * `source` and `entityIndex` rather than from the store) gets it as a
 * confirmed value instead of hunting for an `IFCPROJECT` the model cannot have.
 */
export function declareLengthUnitScale(entityIndex: object, scale: number): void {
  if (Number.isFinite(scale) && scale > 0) declaredScales.set(entityIndex, scale);
}

/** The scale {@link declareLengthUnitScale} recorded for this model; `undefined` when its format declared none. */
export function declaredLengthUnitScale(entityIndex: object): number | undefined {
  return declaredScales.get(entityIndex);
}
