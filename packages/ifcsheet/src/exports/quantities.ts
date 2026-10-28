/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** Quantities measured from geometry when the model states none (#74): closed-mesh volume, a wall's side, a slab's top; the declared figure wins. Add new exports of this area here, not in `../index.ts`. */

export { measureElement, measuredAreaKind, withMeasured, type ElementMeasure, type MeasureMesh, type MeasureRefusal, type MeasuredAreaKind, type MeasuredFigure, type QuantitySource, type SourcedQuantities } from '../measured-quantities.js';
