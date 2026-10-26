/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * IFCX has no unit assignment: no IfcProject.UnitsInContext, no node that names
 * a length unit (hello-wall.ifcx imports the ifc, prop, ifc-mat, usd and nlsfb
 * schemas and none declares one). Its lengths are SI metres by the format's
 * definition, and this reader takes every coordinate and quantity as authored
 * (`extractGeometry` applies no scale), which is the same statement from the
 * reading side. So the unit of an IFCX model is KNOWN, not assumed, and is
 * handed to every consumer as the factor the IFC reader hands over for a
 * metre-declaring file: 1.
 */
export const IFCX_LENGTH_UNIT_SCALE = 1;
