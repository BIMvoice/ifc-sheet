/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `entities()`'s `descriptor.filters` predicate. Formerly split out of
 * `headless-backend.ts` (CLI) and `backend-query.ts` (MCP) into two
 * package-local copies — `packages/cli/src/property-filter-match.ts` and
 * `packages/mcp/src/property-filter-match.ts` — that were functional twins:
 * identical bodies, comments the only difference, with nothing enforcing
 * that they stayed identical. Both packages already depend on
 * `@ifc-lite/query` for `findAllPropertiesInSets`/`compareFilterValue`, so
 * there was no reason for two copies; this is now the one implementation
 * both `HeadlessBackend` (CLI) and the MCP backend import.
 *
 * Any-match, not first-match (#3490): an entity can carry two distinct
 * same-named property sets (type + occurrence), so a filter predicate
 * passes when ANY of them satisfies the condition, not just the first
 * one found. This applies uniformly to every operator, `!=` included.
 *
 * Falls back to quantity sets when no property set matches `filter.psetName`
 * (a `Qto_` filter otherwise matched zero entities even when the quantity
 * was present — the exact "silent empty result" defect class #4091
 * reported, discovered while wiring `#4094`'s `.select()`/`--select`
 * selector adapter, which can legitimately translate `Qto_WallBaseQuantities.
 * NetVolume>1` into this same filter shape). Mirrors the CLI `--where`
 * flag's own fallback (`applyWhereFilter` in `packages/cli/src/commands/
 * where-filter.ts`) so `bim.query().where('Qto_...', ...)`, CLI `--where
 * 'Qto_...'`, and MCP `query_entities` all agree.
 *
 * `compareFilterValue` is the same comparison the viewer SDK adapter and the
 * CLI `--where` flag use for their `QueryBackendMethods.where`, so this
 * can't drift from their boolean-normalization/case-insensitive-`contains`
 * semantics either.
 */

import { findAllPropertiesInSets, findAllQuantitiesInSets } from './pset-lookup.js';
import { compareFilterValue } from './filter-predicate.js';
import type { QueryFilterLike } from './selector/to-query-descriptor.js';

/** Minimal property shape this module needs: a name to match and a value to compare. */
interface PropertyLike {
  readonly name: string;
  readonly value: unknown;
}

/** Minimal property-set shape this module needs. */
interface PropertySetLike {
  readonly name: string;
  readonly properties: readonly PropertyLike[];
}

/** Minimal quantity shape this module needs: a name to match and a value to compare. */
interface QuantityLike {
  readonly name: string;
  readonly value: unknown;
}

/** Minimal quantity-set shape this module needs. */
interface QuantitySetLike {
  readonly name: string;
  readonly quantities: readonly QuantityLike[];
}

export function matchesPropertyFilter(
  props: readonly PropertySetLike[],
  filter: QueryFilterLike,
  qsets: readonly QuantitySetLike[] = [],
): boolean {
  const matchingProps = findAllPropertiesInSets(props, filter.psetName, filter.propName);
  if (matchingProps.length > 0) {
    if (filter.operator === 'exists') return true;
    return matchingProps.some((prop) => compareFilterValue(prop.value, filter.operator, filter.value));
  }
  const matchingQtys = findAllQuantitiesInSets(qsets, filter.psetName, filter.propName);
  if (matchingQtys.length === 0) return false;
  if (filter.operator === 'exists') return true;
  return matchingQtys.some((qty) => compareFilterValue(qty.value, filter.operator, filter.value));
}
