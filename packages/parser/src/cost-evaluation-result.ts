/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { EvaluatedCost } from './cost-evaluation-arithmetic.js';
import type { CostDiagnostic, CostEvaluationResult, CostGraphExtraction } from './cost-types.js';

export function unsupportedCostEvaluation(
  extraction: CostGraphExtraction, expressId: number,
): CostEvaluationResult | undefined {
  if (extraction.SchemaVersion !== 'IFC2X3' && extraction.SchemaVersion !== 'IFC5') return undefined;
  return { expressId, Diagnostics: [{
    Code: extraction.SchemaVersion === 'IFC2X3' ? 'IFC2X3_PARTIAL_READ' : 'UNSUPPORTED_SCHEMA',
    Message: `${extraction.SchemaVersion} cost values are preserved for inspection but not evaluated`,
    Severity: 'warning', expressId,
  }] };
}

export function costEvaluationResult(
  expressId: number, value: EvaluatedCost, diagnostics: CostDiagnostic[],
): CostEvaluationResult {
  return {
    expressId, Amount: value.invalid ? undefined : value.amount?.toString(), Currency: value.currency,
    Dimension: value.rateDimension ?? value.dimension, QuantityApplied: value.quantityApplied?.toString(),
    Diagnostics: diagnostics,
  };
}
