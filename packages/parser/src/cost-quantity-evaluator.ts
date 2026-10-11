/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Decimal } from 'decimal.js';
import { isZeroCostNumericLexeme } from './cost-step-lexemes.js';
import type {
  CostDiagnostic, CostGraphExtraction, CostItemInfo, CostQuantityDimension,
  CostQuantityInfo, CostUnitInfo,
} from './cost-types.js';

export interface QuantityValue {
  amount: Decimal;
  dimension: CostQuantityDimension;
}

interface QuantityContext {
  DecimalValue: Decimal.Constructor;
  extraction: CostGraphExtraction;
  quantities: Map<number, CostQuantityInfo>;
  units: Map<number, CostUnitInfo>;
  diagnostics: CostDiagnostic[];
}

export interface QuantityEvaluationCache {
  memo: Map<number, QuantityValue[]>;
  work: number;
  exhausted: boolean;
  reported: boolean;
}

export function quantityEvaluationCache(): QuantityEvaluationCache {
  return { memo: new Map(), work: 0, exhausted: false, reported: false };
}

function diagnostic(context: QuantityContext, Code: CostDiagnostic['Code'], Message: string,
  expressId: number): void {
  context.diagnostics.push({ Code, Message, Severity: 'error', expressId });
}

function decimal(value: string, expressId: number, context: QuantityContext): Decimal | undefined {
  try {
    const parsed = new context.DecimalValue(value);
    if (parsed.isFinite() && !(parsed.isZero() && !isZeroCostNumericLexeme(value))) return parsed;
  } catch (error) {
    diagnostic(context, 'INVALID_NUMBER', `#${expressId} contains an invalid decimal: ${String(error)}`, expressId);
    return undefined;
  }
  diagnostic(context, 'INVALID_NUMBER', `#${expressId} contains a non-finite or underflowed decimal`, expressId);
  return undefined;
}

function quantityUnit(quantity: CostQuantityInfo, context: QuantityContext): CostUnitInfo | undefined {
  if (quantity.Unit !== undefined) return context.units.get(quantity.Unit);
  if (quantity.Dimension === 'count' || quantity.Dimension === 'number') {
    return { expressId: 0, Type: 'Dimensionless', Dimension: quantity.Dimension, Scale: '1' };
  }
  const id = quantity.Dimension ? context.extraction.ProjectUnits[quantity.Dimension] : undefined;
  return id === undefined ? undefined : context.units.get(id);
}

function quantityValue(quantity: CostQuantityInfo): string | undefined {
  return quantity.LengthValue ?? quantity.AreaValue ?? quantity.VolumeValue ?? quantity.CountValue ??
    quantity.WeightValue ?? quantity.TimeValue ?? quantity.NumberValue;
}

export function itemQuantities(
  item: CostItemInfo,
  context: QuantityContext,
  cache: QuantityEvaluationCache = quantityEvaluationCache(),
): QuantityValue[] | undefined {
  if (item.CostQuantities === undefined) return [];
  if (item.CostQuantities.length === 0) {
    diagnostic(context, 'INVALID_LIST', `CostQuantities on #${item.expressId} must not be empty`, item.expressId);
    return undefined;
  }
  const memo = cache.memo;
  const state = new Map<number, 1 | 2>();
  let work = 0;
  const consume = (amount = 1): boolean => {
    work += amount;
    cache.work += amount;
    if (work > 100_000 || cache.work > 1_000_000) cache.exhausted = true;
    if (!cache.exhausted) return true;
    if (!cache.reported) {
      diagnostic(context, 'INVALID_LIST',
        `Cost quantity graph on #${item.expressId} exceeds the evaluation budget`, item.expressId);
      cache.reported = true;
    }
    return false;
  };
  for (const root of item.CostQuantities) {
    const stack: Array<{ id: number; exit: boolean }> = [{ id: root, exit: false }];
    while (stack.length > 0) {
      if (!consume()) return undefined;
      const frame = stack.pop() as { id: number; exit: boolean };
    const id = frame.id;
    if (frame.exit) {
      state.set(id, 2);
      const quantity = context.quantities.get(id);
      if (quantity?.HasQuantities !== undefined) {
        if (!consume(quantity.HasQuantities.length)) return undefined;
        const totals = new Map<CostQuantityDimension, Decimal>();
        for (const child of quantity.HasQuantities) {
          const childValues = memo.get(child);
          if (!childValues) return undefined;
          for (const entry of childValues) {
            totals.set(entry.dimension, (totals.get(entry.dimension) ?? new context.DecimalValue(0)).plus(entry.amount));
          }
        }
        memo.set(id, [...totals].map(([dimension, amount]) => ({ dimension, amount })));
      }
      continue;
    }
    if (memo.has(id)) continue;
    const quantity = context.quantities.get(id);
    if (!quantity) {
      diagnostic(context, 'MISSING_REFERENCE', `Cost quantity #${id} cannot be resolved`, item.expressId);
      return undefined;
    }
    if (quantity.HasQuantities !== undefined) {
      if (quantity.InvalidHasQuantities) {
        diagnostic(context, 'INVALID_LIST', `Complex cost quantity #${id} has malformed children`, id);
        return undefined;
      }
      if (quantity.HasQuantities.length === 0) {
        diagnostic(context, 'INVALID_LIST', `Complex cost quantity #${id} has no children`, id);
        return undefined;
      }
      if (state.get(id) === 1) {
        diagnostic(context, 'QUANTITY_CYCLE', `Cost quantity cycle includes #${id}`, id);
        return undefined;
      }
      state.set(id, 1);
      stack.push({ id, exit: true });
      for (const child of [...new Set(quantity.HasQuantities)].reverse()) {
        if (!memo.has(child)) stack.push({ id: child, exit: false });
      }
      continue;
    }
    const value = quantityValue(quantity);
    if (!quantity.Dimension || value === undefined) {
      diagnostic(context, 'MISSING_VALUE', `Cost quantity #${id} has no evaluable value`, id);
      return undefined;
    }
    const amount = decimal(value, id, context);
    if (quantity.InvalidUnit) {
      diagnostic(context, 'UNSUPPORTED_UNIT', `Cost quantity #${id} has a malformed Unit`, id);
      return undefined;
    }
    const unit = quantityUnit(quantity, context);
    const wrongDimension = unit?.Dimension !== undefined && unit.Dimension !== quantity.Dimension;
    if (!amount || amount.isNegative() || !unit?.Scale || wrongDimension) {
      if (amount?.isNegative()) diagnostic(context, 'INVALID_NUMBER', `Cost quantity #${id} is negative`, id);
      else if (amount && wrongDimension) {
        diagnostic(context, 'INCOMPATIBLE_UNIT',
          `Cost quantity #${id} uses a ${unit?.Dimension} unit for ${quantity.Dimension}`, id);
      } else if (amount && !unit?.Scale) {
        diagnostic(context, 'UNSUPPORTED_UNIT', `Cost quantity #${id} has no resolvable unit`, id);
      }
      return undefined;
    }
    const normalized = amount.mul(unit.Scale);
    if (!normalized.isFinite() || (normalized.isZero() && !amount.isZero())) {
      diagnostic(context, 'INVALID_NUMBER', `Cost quantity #${id} has a non-finite normalized value`, id);
      return undefined;
    }
      memo.set(id, [{ amount: normalized, dimension: quantity.Dimension }]);
    }
  }
  const totals = new Map<CostQuantityDimension, Decimal>();
  for (const root of item.CostQuantities) {
    for (const entry of memo.get(root) ?? []) {
      totals.set(entry.dimension, (totals.get(entry.dimension) ?? new context.DecimalValue(0)).plus(entry.amount));
    }
  }
  return [...totals].map(([dimension, amount]) => ({ dimension, amount }));
}
