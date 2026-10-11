/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Decimal } from 'decimal.js';
import type {
  CostDiagnostic,
  CostMeasureWithUnitInfo,
  CostQuantityDimension,
  CostUnitInfo,
} from './cost-types.js';
import { asEnum, asString, CostEntityReader } from './cost-reader.js';

const PREFIX_SCALE: Record<string, string> = {
  EXA: '1e18', PETA: '1e15', TERA: '1e12', GIGA: '1e9', MEGA: '1e6',
  KILO: '1e3', HECTO: '1e2', DECA: '1e1', DECI: '1e-1', CENTI: '1e-2',
  MILLI: '1e-3', MICRO: '1e-6', NANO: '1e-9', PICO: '1e-12',
  FEMTO: '1e-15', ATTO: '1e-18',
};

const PREFIX_SYMBOL: Record<string, string> = {
  EXA: 'E', PETA: 'P', TERA: 'T', GIGA: 'G', MEGA: 'M', KILO: 'k', HECTO: 'h',
  DECA: 'da', DECI: 'd', CENTI: 'c', MILLI: 'm', MICRO: 'µ', NANO: 'n',
  PICO: 'p', FEMTO: 'f', ATTO: 'a',
};

function siSymbol(dimension: CostQuantityDimension | undefined, prefix: string | undefined): string | undefined {
  const stem = dimension === 'mass' ? 'g' : dimension === 'time' ? 's' : dimension === 'length' ||
    dimension === 'area' || dimension === 'volume' ? 'm' : undefined;
  if (!stem) return dimension === 'number' ? '1' : undefined;
  const exponent = dimension === 'area' ? '²' : dimension === 'volume' ? '³' : '';
  return `${prefix ? PREFIX_SYMBOL[prefix] ?? prefix : ''}${stem}${exponent}`;
}

function namedSymbol(name: string | undefined): string | undefined {
  const symbols: Record<string, string> = { HOUR: 'h', MINUTE: 'min', FOOT: 'ft', INCH: 'in' };
  return name ? symbols[name.toUpperCase()] ?? name : undefined;
}

function significantDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

function exactProduct(left: string, right: string, precision: number): string {
  const ExactDecimal = Decimal.clone({ precision });
  return new ExactDecimal(left).mul(right).toString();
}

const MAX_CONVERSION_SCALE_DIGITS = 10_000;
const MAX_CONVERSION_SCALE_WORK = 100_000;

function dimensionForUnitType(unitType: string | undefined): CostQuantityDimension | undefined {
  switch (unitType) {
    case 'LENGTHUNIT': return 'length';
    case 'AREAUNIT': return 'area';
    case 'VOLUMEUNIT': return 'volume';
    case 'MASSUNIT': return 'mass';
    case 'TIMEUNIT': return 'time';
    case 'USERDEFINED': return 'number';
    default: return undefined;
  }
}

function siScale(
  dimension: CostQuantityDimension | undefined,
  prefix: string | undefined,
  name: string | undefined,
): string | undefined {
  if (!dimension) return undefined;
  const expectedName: Partial<Record<CostQuantityDimension, string>> = {
    length: 'METRE', area: 'SQUARE_METRE', volume: 'CUBIC_METRE', mass: 'GRAM', time: 'SECOND',
  };
  if (expectedName[dimension] !== name) return undefined;
  const prefixScale = new Decimal(prefix ? PREFIX_SCALE[prefix] ?? '1' : '1');
  if (dimension === 'mass') {
    // IFC mass SI units are grams; canonical evaluation uses kilograms.
    return prefixScale.mul('0.001').toString();
  }
  const exponent = dimension === 'area' ? 2 : dimension === 'volume' ? 3 : 1;
  return prefixScale.pow(exponent).toString();
}

export interface ResolvedMeasureWithUnit {
  Value: string;
  Unit: CostUnitInfo;
  ValueType?: string;
  ValueDimension?: CostQuantityDimension;
}

export interface CompatibilityMeasureWithUnit {
  Value?: string;
  Unit?: CostUnitInfo;
}

function dimensionForMeasure(type: string | undefined): CostQuantityDimension | undefined {
  switch (type) {
    case 'IFCLENGTHMEASURE': return 'length';
    case 'IFCAREAMEASURE': return 'area';
    case 'IFCVOLUMEMEASURE': return 'volume';
    case 'IFCMASSMEASURE': return 'mass';
    case 'IFCTIMEMEASURE': return 'time';
    case 'IFCCOUNTMEASURE': return 'count';
    case 'IFCNUMERICMEASURE': case 'IFCREAL': case 'IFCINTEGER': return 'number';
    default: return undefined;
  }
}

export class CostUnitResolver {
  readonly Units = new Map<number, CostUnitInfo>();
  readonly MeasuresWithUnit = new Map<number, CostMeasureWithUnitInfo>();
  readonly ProjectUnits = new Map<CostQuantityDimension, CostUnitInfo>();
  Currency?: string;
  private conversionScaleWork = 0;
  private conversionScaleBudgetReported = false;

  constructor(
    private readonly reader: CostEntityReader,
    private readonly diagnostics: CostDiagnostic[],
  ) {
    this.readProjectUnits();
  }

  resolve(expressId: number): CostUnitInfo | undefined {
    const active = new Set<number>();
    const stack: Array<{ id: number; exit: boolean }> = [{ id: expressId, exit: false }];
    while (stack.length > 0) {
      const frame = stack.pop() as { id: number; exit: boolean };
      if (frame.exit) {
        active.delete(frame.id);
        if (!this.Units.has(frame.id)) this.buildConversionUnit(frame.id);
        continue;
      }
      if (this.Units.has(frame.id)) continue;
      const entity = this.reader.get(frame.id);
      if (!entity) {
        this.warn('MISSING_REFERENCE', `Unit #${frame.id} cannot be resolved`, frame.id);
        continue;
      }
      if (active.has(frame.id)) {
        this.warn('UNSUPPORTED_UNIT', `Cyclic unit definition at #${frame.id}`, frame.id);
        this.Units.set(frame.id, this.unresolvedUnit(frame.id));
        continue;
      }
      if (entity.type.toUpperCase() !== 'IFCCONVERSIONBASEDUNIT') {
        this.Units.set(frame.id, this.buildSimpleUnit(frame.id));
        continue;
      }
      active.add(frame.id);
      stack.push({ id: frame.id, exit: true });
      const measureId = this.reference(frame.id, 3, 'ConversionFactor');
      const dependency = measureId === undefined ? undefined : this.reference(measureId, 1, 'UnitComponent');
      if (dependency !== undefined && !this.Units.has(dependency)) {
        stack.push({ id: dependency, exit: false });
      }
    }
    return this.Units.get(expressId);
  }

  private buildSimpleUnit(expressId: number): CostUnitInfo {
    const entity = this.reader.get(expressId);
    if (!entity) return { expressId, Type: 'Unresolved' };
    const attributes = entity.attributes ?? [];
    const type = entity.type.toUpperCase();
    let unit: CostUnitInfo;
    if (type === 'IFCMONETARYUNIT') {
      unit = {
        expressId,
        Type: 'IfcMonetaryUnit',
        Currency: asEnum(attributes[0]) ?? asString(attributes[0]),
      };
    } else {
      const UnitType = asEnum(attributes[1]);
      const Dimension = dimensionForUnitType(UnitType);
      if (type === 'IFCSIUNIT') {
        const prefixCandidate = asEnum(attributes[2]);
        const validPrefix = !this.reader.attributePresent(expressId, 2) ||
          (prefixCandidate !== undefined && PREFIX_SCALE[prefixCandidate] !== undefined);
        const Prefix = validPrefix ? prefixCandidate : undefined;
        const Name = asEnum(attributes[3]);
        unit = {
          expressId,
          Type: 'IfcSIUnit',
          UnitType,
          Prefix,
          Name,
          Symbol: siSymbol(Dimension, Prefix),
          Dimension,
          Scale: validPrefix ? siScale(Dimension, Prefix, Name) : undefined,
        };
      } else if (type === 'IFCCONVERSIONBASEDUNITWITHOFFSET') {
        // Offset units cannot safely participate in multiplicative cost-rate arithmetic.
        unit = {
          expressId,
          Type: 'IfcConversionBasedUnitWithOffset',
          UnitType,
          Name: asString(attributes[2]),
          Symbol: namedSymbol(asString(attributes[2])),
          Dimension,
        };
      } else {
        unit = {
          expressId,
          Type: entity.type,
          UnitType,
          Name: asString(attributes[2]),
          Symbol: namedSymbol(asString(attributes[2])),
          Dimension,
        };
      }
    }
    if (!unit.Currency && unit.Scale === undefined) {
      this.warn('UNSUPPORTED_UNIT', `Unsupported or unresolved ${unit.Type} #${expressId}`, expressId);
    }
    return unit;
  }

  private unresolvedUnit(expressId: number): CostUnitInfo {
    const entity = this.reader.get(expressId);
    const attributes = entity?.attributes ?? [];
    return {
      expressId,
      Type: entity?.type === 'IFCCONVERSIONBASEDUNIT' ? 'IfcConversionBasedUnit' : entity?.type ?? 'Unresolved',
      UnitType: asEnum(attributes[1]),
      Name: asString(attributes[2]),
      Symbol: namedSymbol(asString(attributes[2])),
      Dimension: dimensionForUnitType(asEnum(attributes[1])),
    };
  }

  private buildConversionUnit(expressId: number): void {
    const entity = this.reader.get(expressId);
    if (!entity) return;
    const attributes = entity.attributes ?? [];
    const UnitType = asEnum(attributes[1]);
    const factor = this.readMeasure(this.reference(expressId, 3, 'ConversionFactor'));
    const Dimension = dimensionForUnitType(UnitType);
    const compatible = factor?.Unit.Dimension === Dimension && factor?.ValueDimension === Dimension;
    const Scale = compatible && factor?.Unit.Scale
      ? this.conversionScale(factor.Value, factor.Unit.Scale, expressId) : undefined;
    const validScale = Scale !== undefined && new Decimal(Scale).isFinite() && new Decimal(Scale).gt(0);
    const unit: CostUnitInfo = {
      expressId, Type: 'IfcConversionBasedUnit', UnitType,
      Name: asString(attributes[2]), Symbol: namedSymbol(asString(attributes[2])),
      Dimension,
      Scale: validScale ? Scale : undefined,
    };
    this.Units.set(expressId, unit);
    if (!compatible && factor) {
      this.warn('INCOMPATIBLE_UNIT', `Conversion unit #${expressId} has an incompatible factor dimension`, expressId);
    } else if (Scale !== undefined && !validScale) {
      this.warn('INVALID_NUMBER', `Conversion unit #${expressId} has a non-positive or non-finite scale`, expressId);
    } else if (unit.Scale === undefined && this.conversionScaleWork <= MAX_CONVERSION_SCALE_WORK) {
      this.warn('UNSUPPORTED_UNIT', `Unsupported or unresolved ${unit.Type} #${expressId}`, expressId);
    }
  }

  private conversionScale(left: string, right: string, expressId: number): string | undefined {
    const precision = significantDigits(left) + significantDigits(right) + 2;
    if (precision > MAX_CONVERSION_SCALE_DIGITS ||
        this.conversionScaleWork + precision > MAX_CONVERSION_SCALE_WORK) {
      this.conversionScaleWork = MAX_CONVERSION_SCALE_WORK + 1;
      if (!this.conversionScaleBudgetReported) {
        this.conversionScaleBudgetReported = true;
        this.warn('UNSUPPORTED_UNIT',
          `Conversion unit #${expressId} exceeds the exact scale evaluation budget`, expressId);
      }
      return undefined;
    }
    this.conversionScaleWork += precision;
    return exactProduct(left, right, precision);
  }

  resolveMeasureWithUnit(expressId: number | undefined): ResolvedMeasureWithUnit | undefined {
    const measure = this.readMeasureHeader(expressId);
    if (!measure) return undefined;
    this.resolve(measure.unitId);
    return this.readMeasure(expressId);
  }

  /** Preserve the former best-effort rate marker without weakening canonical validation. */
  compatibilityMeasureWithUnit(
    expressId: number | undefined,
    canonical: ResolvedMeasureWithUnit | undefined,
  ): CompatibilityMeasureWithUnit | undefined {
    if (expressId === undefined) return undefined;
    const entity = this.reader.get(expressId);
    if (!entity || entity.type.toUpperCase() !== 'IFCMEASUREWITHUNIT') return undefined;
    const unitId = this.reader.referenceLexeme(expressId, 1);
    // ValueComponent and UnitComponent are SELECTs whose compatibility fields
    // have always degraded independently. Do not let a malformed value hide a
    // valid display unit. Avoid retrying a genuinely dangling unit reference.
    const Unit = canonical?.Unit ?? (unitId === undefined ? undefined
      : this.Units.get(unitId) ?? (this.reader.get(unitId) ? this.resolve(unitId) : undefined));
    return { Value: this.reader.decimalLexeme(expressId, 0), Unit };
  }

  private readMeasureHeader(expressId: number | undefined): {
    value: string; unitId: number; dimension?: CostQuantityDimension; type?: string;
  } | undefined {
    if (expressId === undefined) return undefined;
    const entity = this.reader.get(expressId);
    if (!entity || entity.type.toUpperCase() !== 'IFCMEASUREWITHUNIT') {
      this.warn('MISSING_REFERENCE', `IfcMeasureWithUnit #${expressId} cannot be resolved`, expressId);
      return undefined;
    }
    const value = entity.attributes?.[0];
    const typedValue = this.reader.decimalLexeme(expressId, 0);
    const unitId = this.reference(expressId, 1, 'UnitComponent');
    if (typedValue === undefined || unitId === undefined) {
      this.warn('INVALID_NUMBER', `IfcMeasureWithUnit #${expressId} has no supported value`, expressId);
      return undefined;
    }
    const typedName = Array.isArray(value) && typeof value[0] === 'string' ? value[0].toUpperCase() : undefined;
    const dimension = dimensionForMeasure(typedName);
    if (dimension === undefined && typedName !== 'IFCMONETARYMEASURE') {
      this.warn('INCOMPATIBLE_UNIT',
        `IfcMeasureWithUnit #${expressId} has unsupported value type ${typedName ?? '(missing)'}`, expressId);
      return undefined;
    }
    return { value: typedValue, unitId, dimension, type: typedName };
  }

  private readMeasure(expressId: number | undefined): ResolvedMeasureWithUnit | undefined {
    const header = this.readMeasureHeader(expressId);
    if (expressId === undefined || !header) return undefined;
    const unit = this.Units.get(header.unitId);
    if (!unit) return undefined;
    this.MeasuresWithUnit.set(expressId, {
      expressId, ValueComponent: header.value,
      UnitComponent: unit.expressId,
      ValueType: header.type,
      ValueDimension: header.dimension,
    });
    return { Value: header.value, Unit: unit, ValueType: header.type, ValueDimension: header.dimension };
  }

  private readProjectUnits(): void {
    const projectId = this.reader.ids('IFCPROJECT')[0];
    const assignmentId = projectId === undefined ? undefined : this.reference(projectId, 8, 'UnitsInContext');
    const assignment = assignmentId === undefined ? undefined : this.reader.get(assignmentId);
    const unitIds = assignment?.type.toUpperCase() === 'IFCUNITASSIGNMENT'
      ? this.references(assignmentId as number, 0, 'Units') ?? []
      : [];
    const currencies = new Set<string>();
    for (const unitId of unitIds) {
      const unit = this.resolve(unitId);
      if (!unit) continue;
      if (unit.Currency) currencies.add(unit.Currency);
      if (unit.Dimension && unit.Scale !== undefined && !this.ProjectUnits.has(unit.Dimension)) {
        this.ProjectUnits.set(unit.Dimension, unit);
      }
    }
    if (currencies.size === 1) this.Currency = [...currencies][0];
    else if (currencies.size > 1) {
      this.warn('MIXED_CURRENCY',
        `IfcUnitAssignment #${assignmentId} declares conflicting project currencies`, assignmentId as number);
    }
  }

  private warn(Code: CostDiagnostic['Code'], Message: string, expressId: number): void {
    this.diagnostics.push({ Code, Message, Severity: 'warning', expressId });
  }

  private reference(expressId: number, index: number, label: string): number | undefined {
    const ref = this.reader.referenceLexeme(expressId, index);
    if (ref === undefined && this.reader.attributePresent(expressId, index)) {
      this.warn('MISSING_REFERENCE', `${label} on #${expressId} is not an entity reference`, expressId);
    }
    return ref;
  }

  private references(expressId: number, index: number, label: string): number[] | undefined {
    const refs = this.reader.referenceListLexeme(expressId, index);
    if (refs === undefined && this.reader.attributePresent(expressId, index)) {
      this.warn('INVALID_LIST', `${label} on #${expressId} must contain only entity references`, expressId);
    }
    return refs;
  }
}
