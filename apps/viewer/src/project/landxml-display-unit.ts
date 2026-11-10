/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The unit a LandXML file's figures are written in, as the one length unit of "Units and numbers" (#88, #204). The
 * model itself is already in metres (the file's `<Units>` scale is applied when it loads), so a file in feet reads in
 * feet on a dimension only by this default, and only until the project names a unit of its own.
 */

import type { LengthUnit, UnitsAndNumbers } from '@bimvoice/ifcsheet/names';

/** The display unit for a LandXML `linearUnit` token; undefined for the metric ones, which already read as before. */
export function landXmlDisplayUnit(linearUnit: string | undefined): LengthUnit | undefined {
  if (linearUnit === 'foot' || linearUnit === 'feet') return 'ft';
  if (linearUnit === 'USSurveyFoot') return 'ftUS';
  return undefined;
}

/** The project's setting, with the file's unit under it: a unit the project names wins over the file's. */
export function withLandXmlUnit(
  units: UnitsAndNumbers | undefined,
  models: Iterable<{ linked?: boolean; landXmlDocument?: { units: { linearUnit: string } | null } }>,
): UnitsAndNumbers | undefined {
  if (units?.lengthUnit !== undefined) return units;
  const list = [...models];
  const first = list.find((m) => !m.linked) ?? list[0];
  const fromFile = landXmlDisplayUnit(first?.landXmlDocument?.units?.linearUnit);
  return fromFile ? { ...units, lengthUnit: fromFile } : units;
}
