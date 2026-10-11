/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { CostDiagnostic, CostValueInfo } from './cost-types.js';

const COMPONENT_BUDGET = 100_000;

/** Build bounded legacy nested value views while canonical Components stay intact. */
export function compatibilityTreeBuilder(
  values: Map<number | undefined, CostValueInfo>,
  diagnostics: CostDiagnostic[],
): (root: number) => CostValueInfo[] | undefined {
  let remaining = COMPONENT_BUDGET;
  let budgetReported = false;
  const reportBudget = (expressId: number): void => {
    if (budgetReported) return;
    budgetReported = true;
    diagnostics.push({
      Code: 'INVALID_LIST',
      Message: `Compatibility IfcAppliedValue trees exceed the shared ${COMPONENT_BUDGET}-component budget`,
      Severity: 'warning', expressId,
    });
  };
  const build = (root: number, depth = 0, visiting = new Set<number>()): CostValueInfo[] | undefined => {
    if (depth > 20 || visiting.has(root)) return undefined;
    const source = values.get(root);
    if (!source) return undefined;
    visiting.add(root);
    const components: CostValueInfo[] = [];
    for (const id of source.Components ?? []) {
      if (remaining <= 0) {
        reportBudget(root);
        break;
      }
      remaining--;
      const child = values.get(id);
      if (!child || visiting.has(id)) continue;
      const { components: omitted, ...copy } = child;
      void omitted;
      const nested = build(id, depth + 1, visiting);
      components.push({ ...copy, ...(nested?.length ? { components: nested } : {}) });
    }
    visiting.delete(root);
    return components.length ? components : undefined;
  };
  return build;
}
