/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { asString, CostEntityReader } from './cost-reader.js';
import { getInheritanceChain } from './ifc-schema.js';
import type { CostDiagnostic, CostQuantityDimension, CostQuantityInfo } from './cost-types.js';

function quantityDimension(type: string): CostQuantityDimension | undefined {
  switch (type) {
    case 'IFCQUANTITYLENGTH': return 'length';
    case 'IFCQUANTITYAREA': return 'area';
    case 'IFCQUANTITYVOLUME': return 'volume';
    case 'IFCQUANTITYWEIGHT': return 'mass';
    case 'IFCQUANTITYTIME': return 'time';
    case 'IFCQUANTITYCOUNT': return 'count';
    case 'IFCQUANTITYNUMBER': return 'number';
    default: return undefined;
  }
}

function quantityMeasureType(type: string): string | undefined {
  switch (type) {
    case 'IFCQUANTITYLENGTH': return 'IFCLENGTHMEASURE';
    case 'IFCQUANTITYAREA': return 'IFCAREAMEASURE';
    case 'IFCQUANTITYVOLUME': return 'IFCVOLUMEMEASURE';
    case 'IFCQUANTITYWEIGHT': return 'IFCMASSMEASURE';
    case 'IFCQUANTITYTIME': return 'IFCTIMEMEASURE';
    case 'IFCQUANTITYCOUNT': return 'IFCCOUNTMEASURE';
    case 'IFCQUANTITYNUMBER': return 'IFCNUMERICMEASURE';
    default: return undefined;
  }
}

function pascalType(type: string): string {
  const known: Record<string, string> = {
    IFCQUANTITYLENGTH: 'IfcQuantityLength', IFCQUANTITYAREA: 'IfcQuantityArea',
    IFCQUANTITYVOLUME: 'IfcQuantityVolume', IFCQUANTITYWEIGHT: 'IfcQuantityWeight',
    IFCQUANTITYTIME: 'IfcQuantityTime', IFCQUANTITYCOUNT: 'IfcQuantityCount',
    IFCQUANTITYNUMBER: 'IfcQuantityNumber',
    IFCPHYSICALCOMPLEXQUANTITY: 'IfcPhysicalComplexQuantity',
  };
  return known[type] ?? type;
}

export function costQuantityExactValue(quantity: CostQuantityInfo): string | undefined {
  return quantity.LengthValue ?? quantity.AreaValue ?? quantity.VolumeValue ?? quantity.CountValue ??
    quantity.WeightValue ?? quantity.TimeValue ?? quantity.NumberValue;
}

export function extractCostQuantities(
  reader: CostEntityReader,
  roots: number[],
  quantities: Map<number, CostQuantityInfo>,
  diagnostics: CostDiagnostic[],
): void {
  const state = new Map<number, 1 | 2>();
  const stack: Array<{ id: number; exit: boolean }> = roots.map(id => ({ id, exit: false })).reverse();
  while (stack.length > 0) {
    const frame = stack.pop() as { id: number; exit: boolean };
    if (frame.exit) {
      state.set(frame.id, 2);
      continue;
    }
    if (state.get(frame.id) === 1) {
      diagnostics.push({ Code: 'QUANTITY_CYCLE', Message: `Cost quantity cycle includes #${frame.id}`,
        Severity: 'error', expressId: frame.id });
      continue;
    }
    if (state.get(frame.id) === 2 || quantities.has(frame.id)) continue;
    const entity = reader.get(frame.id);
    if (!entity) {
      diagnostics.push({ Code: 'MISSING_REFERENCE', Message: `Cost quantity #${frame.id} cannot be resolved`,
        Severity: 'error', expressId: frame.id });
      continue;
    }
    const type = entity.type.toUpperCase();
    if (!getInheritanceChain(type).some(entry => entry.toUpperCase() === 'IFCPHYSICALQUANTITY')) {
      diagnostics.push({ Code: 'INVALID_LIST',
        Message: `Cost quantity reference #${frame.id} does not resolve to IfcPhysicalQuantity`,
        Severity: 'error', expressId: frame.id });
      state.set(frame.id, 2);
      continue;
    }
    const attributes = entity.attributes ?? [];
    const isComplex = type === 'IFCPHYSICALCOMPLEXQUANTITY';
    const children = isComplex ? reader.referenceListLexeme(frame.id, 2) : undefined;
    const invalidChildren = isComplex && (!Array.isArray(attributes[2]) ||
      children === undefined || children.length !== attributes[2].length);
    const valueType = isComplex ? undefined : reader.decimalTypeLexeme(frame.id, 3);
    const invalidValueType = valueType !== undefined && valueType !== quantityMeasureType(type);
    const value = isComplex || invalidValueType ? undefined : reader.decimalLexeme(frame.id, 3);
    if (!isComplex && value === undefined && reader.attributePresent(frame.id, 3)) {
      diagnostics.push({ Code: invalidValueType ? 'INCOMPATIBLE_UNIT' : 'INVALID_NUMBER',
        Message: invalidValueType
          ? `Cost quantity #${frame.id} uses ${valueType} where ${quantityMeasureType(type)} is required`
          : `Cost quantity #${frame.id} has a malformed value`,
        Severity: 'error', expressId: frame.id });
    }
    const Unit = isComplex ? undefined : reader.referenceLexeme(frame.id, 2);
    const InvalidUnit = !isComplex && reader.attributePresent(frame.id, 2) && Unit === undefined;
    if (InvalidUnit) diagnostics.push({ Code: 'UNSUPPORTED_UNIT',
      Message: `Unit on cost quantity #${frame.id} is not an entity reference`, Severity: 'error', expressId: frame.id });
    const valueAttribute: Record<string, string> = {
      IFCQUANTITYLENGTH: 'LengthValue', IFCQUANTITYAREA: 'AreaValue',
      IFCQUANTITYVOLUME: 'VolumeValue', IFCQUANTITYCOUNT: 'CountValue',
      IFCQUANTITYWEIGHT: 'WeightValue', IFCQUANTITYTIME: 'TimeValue',
      IFCQUANTITYNUMBER: 'NumberValue',
    };
    const exactValue = value === undefined || valueAttribute[type] === undefined
      ? {} : { [valueAttribute[type]]: value };
    quantities.set(frame.id, {
      expressId: frame.id, Type: pascalType(type),
      Name: asString(attributes[0]), Description: asString(attributes[1]),
      Unit, InvalidUnit: InvalidUnit || undefined, ...exactValue,
      Formula: isComplex ? undefined : asString(attributes[4]),
      Dimension: quantityDimension(type), HasQuantities: isComplex ? children ?? [] : undefined,
      InvalidHasQuantities: invalidChildren || undefined,
    });
    state.set(frame.id, 1);
    stack.push({ id: frame.id, exit: true });
    for (const child of [...(children ?? [])].reverse()) stack.push({ id: child, exit: false });
  }
}
