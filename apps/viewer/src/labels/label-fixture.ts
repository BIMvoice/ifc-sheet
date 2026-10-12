/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A small wall for the label tests: own and type data, with the type carrying what the wall lacks. */

import type { LabelElement, PropertySetLike, QuantitySetLike } from './label-resolve';

export function wall(over: Partial<LabelElement> = {}): LabelElement {
  const attributes: Record<string, string> = { Name: 'W-01', Tag: 'T7', ObjectType: 'Basic Wall', Description: '', PredefinedType: 'STANDARD', GlobalId: '2O2Fr$t4X7Zf8NOew3FLOH' };
  const psets: PropertySetLike[] = [{ name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: 'EI 60' }, { name: 'IsExternal', value: true }, { name: 'Note', value: '' }] }];
  const qsets: QuantitySetLike[] = [{ name: 'Qto_WallBaseQuantities', quantities: [{ name: 'Length', value: 4.2857, length: true }, { name: 'Height', value: 2.5, length: true }, { name: 'NetArea', value: 10.714 }] }];
  return {
    attribute: (n) => attributes[n] ?? '',
    className: () => 'IfcWall',
    typeName: () => 'WT-200',
    propertySets: () => psets,
    quantitySets: () => qsets,
    typePropertySets: () => [{ name: 'Pset_WallCommon', properties: [{ name: 'ThermalTransmittance', value: 0.24 }, { name: 'FireRating', value: 'EI 30' }] }],
    typeQuantitySets: () => [],
    materials: () => ['Concrete', 'Insulation'],
    storey: () => 'Level 1',
    lengthUnitScale: () => 1,
    ...over,
  };
}
