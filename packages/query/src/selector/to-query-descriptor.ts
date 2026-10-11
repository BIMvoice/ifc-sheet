/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Adapter: IfcOpenShell selector AST → `QueryDescriptor` (`packages/sdk/src/
 * types.ts`), the shape `bim.query()` already executes.
 *
 * This is the second adapter the AST was built for — `apps/viewer/src/lib/
 * search/selector-to-rules.ts` is the first, onto the viewer's `FilterRule[]`.
 * The two read the same tree (walk `SelectorFilter`/`SelectorQuery` from
 * `./ast.js`) but cannot share a target shape: a `FilterRule` can express a
 * `notIn` class exclusion, a GlobalId set, an entity attribute, a material, a
 * classification, a storey — `QueryDescriptor` can express exactly two
 * things, a list of `types` to include and a list of exact-name Pset/Qto
 * `filters` (see `packages/sdk/src/types.ts:218-233`; `ComparisonOp` is
 * pinned to `FilterComparisonOp` in `filter-predicate.ts`, so this module's
 * operator table has to stay a subset of that, not invent its own).
 *
 * `packages/query/src/property-filter.ts`'s `matchesPsetFilter`/
 * `matchesQsetFilter` do exact string equality on `psetName`/`propName`, no
 * regex — so a selector's own regex pset/property NAMES (`/Pset_.*Common/.
 * Prop=`) have no target here even though the viewer's `FilterRule` can carry
 * one. Losing that silently — translating the term as if it named a set
 * whose literal spelling *is* the pattern text, or just dropping the term —
 * is exactly the defect #4091 reported: a selector that matched nothing
 * looked identical to no selector at all. So every construct outside the
 * lossless subset below throws {@link SelectorUnsupportedError} naming it,
 * rather than degrading to a partial or empty descriptor.
 *
 * The lossless subset:
 *   - Class terms: `IfcWall`, comma unions (`IfcWall, IfcSlab`). The
 *     descriptor keeps the normalized base names; each query backend expands
 *     them against the schema of the model it is currently evaluating.
 *   - Exact-name property/quantity comparisons: `Pset_WallCommon.
 *     FireRating=2HR`, `Qto_WallBaseQuantities.NetVolume>1` — both read as
 *     the same `QueryFilter` shape; the quantity fallback lives in
 *     `matchesPropertyFilter` (`packages/query/src/property-filter-match.ts`,
 *     the one implementation both the CLI and MCP backends import), not here.
 *   - `=` `!=` `>` `>=` `<` `<=` map onto their `ComparisonOp` namesakes,
 *     `*=` maps onto `contains`.
 *   - A `/…/` value with `=` maps onto `matches`, carrying the regex SOURCE
 *     (no delimiters) — the same shape `compareFilterValue`'s `matches`
 *     already expects.
 *   - `Prop!=NULL` (or `Pset.Prop!=NULL`) — "this property is set" — maps
 *     onto `exists`. `Prop=NULL` ("not set") has no target: `ComparisonOp`
 *     has `exists` but no negation of it.
 *
 * Everything else the grammar can produce has no lossless target and throws:
 * regex pset/property NAMES, `!*=` (not-contains), a regex value on any
 * operator but `=`, `Prop=NULL`, entity-attribute terms (`Name=`, `GlobalId=`,
 * a bare GlobalId literal, generic `attribute=`, `type=`), `!` class
 * negation, `+` group unions, `parent=`, `query:`, `material=`,
 * `classification=`, `location=`.
 */

import { isKnownType, normalizeIfcTypeName } from '@ifc-lite/parser';
import { parseSelector } from './parse.js';
import type { SelectorFilter, SelectorOp, SelectorText } from './ast.js';
import type { FilterComparisonOp } from '../filter-predicate.js';

/**
 * The `QueryFilter` shape (`packages/sdk/src/types.ts`), redeclared here
 * rather than imported: `@ifc-lite/query` does not depend on `@ifc-lite/sdk`
 * (the dependency runs the other way — `sdk` depends on `query`), so this
 * module cannot name the SDK's type directly. `operator` is `FilterComparisonOp`
 * from this same package's `filter-predicate.ts`, which `@ifc-lite/sdk`'s
 * `ComparisonOp` is already pinned to stay in step with — so this type is
 * structurally identical to `QueryFilter`, not a parallel definition that can
 * drift from it.
 */
export interface QueryFilterLike {
  psetName: string;
  propName: string;
  operator: FilterComparisonOp;
  value?: string | number | boolean;
}

export interface QueryDescriptorLike {
  types: string[];
  filters: QueryFilterLike[];
}

/**
 * Thrown the moment a selector's parsed AST contains a construct with no
 * lossless target in `QueryDescriptor`. `.constructs` holds one entry per
 * unsupported construct (the same strings `.message` lists), quoting the
 * user's original spelling, for a caller that wants to inspect them
 * programmatically rather than just print `.message`.
 */
export class SelectorUnsupportedError extends Error {
  readonly constructs: string[];

  constructor(selectorText: string, constructs: string[]) {
    super(
      `Selector ${quote(selectorText)} uses construct(s) this query surface cannot translate ` +
        `losslessly, so it was rejected rather than run as a partial or empty filter:\n` +
        constructs.map((c) => `  - ${c}`).join('\n'),
    );
    this.name = 'SelectorUnsupportedError';
    this.constructs = constructs;
  }
}

/**
 * Parse selector text and translate it to a `QueryDescriptor`-shaped
 * `{ types, filters }`, or throw. Never returns a partial result: either
 * every construct in the (single, non-unioned) group translates losslessly,
 * or this throws naming every construct that didn't — see the module doc for
 * why a partial/empty descriptor is not an acceptable fallback here.
 */
export function selectorToQueryDescriptor(
  text: string,
): QueryDescriptorLike {
  const parsed = parseSelector(text);
  if (!parsed.ok) {
    throw new Error(`Selector ${quote(text)} failed to parse: ${parsed.error.message}`);
  }

  const unsupported: string[] = [];
  const { groups } = parsed.query;
  const [group, ...extraGroups] = groups;

  for (const extra of extraGroups) {
    unsupported.push(
      `${quote(extra.filters.map((f) => f.text).join(', '))}: unioning groups with "+" has no target in a QueryDescriptor (it can only AND filters), run it as a second query`,
    );
  }

  const classAdds: string[] = [];
  const filters: QueryFilterLike[] = [];

  for (const filter of group?.filters ?? []) {
    if (filter.kind === 'class') {
      if (!isKnownType(filter.name)) {
        unsupported.push(`${quote(filter.text)}: not an entity name in IFC2X3, IFC4 or IFC4X3`);
        continue;
      }
      if (filter.negate) {
        unsupported.push(`${quote(filter.text)}: "!" class negation has no target in a QueryDescriptor's "types" list`);
        continue;
      }
      classAdds.push(filter.name);
      continue;
    }
    if (filter.kind === 'globalId') {
      unsupported.push(`${quote(filter.text)}: a bare GlobalId term has no target in a QueryDescriptor`);
      continue;
    }
    if (filter.kind === 'property') {
      const adapted = adaptProperty(filter);
      if (typeof adapted === 'string') unsupported.push(adapted);
      else filters.push(adapted);
      continue;
    }
    // attribute, material, classification, location, parent, query, type
    unsupported.push(unsupportedKeyword(filter));
  }

  if (unsupported.length > 0) throw new SelectorUnsupportedError(text, unsupported);

  return {
    // QueryDescriptor types are intentionally unexpanded. A descriptor may
    // execute across an IFC2X3 + IFC4/4X3 federation, and every backend already
    // expands this list against each model's own schema. Expanding here from
    // the active/first model would leak that schema's descendants into the
    // others and would make `.model().select()` differ from `.select().model()`.
    types: classAdds.map(normalizeIfcTypeName),
    filters,
  };
}

function unsupportedKeyword(filter: SelectorFilter): string {
  switch (filter.kind) {
    case 'attribute':
      return `${quote(filter.text)}: an entity attribute comparison has no target in a QueryDescriptor (only Pset_/Qto_ properties do)`;
    case 'material':
      return `${quote(filter.text)}: "material=" has no target in a QueryDescriptor`;
    case 'classification':
      return `${quote(filter.text)}: "classification=" has no target in a QueryDescriptor`;
    case 'location':
      return `${quote(filter.text)}: "location=" has no target in a QueryDescriptor`;
    case 'parent':
      return `${quote(filter.text)}: "parent=" is not supported`;
    case 'query':
      return `${quote(filter.text)}: "query:" value queries are not supported`;
    case 'type':
      return `${quote(filter.text)}: "type=" (relating type name) has no target in a QueryDescriptor`;
    default:
      return `${quote(filter.text)}: unsupported construct`;
  }
}

/** One property/quantity comparison, or the sentence explaining why it has
 *  no `QueryFilter` target. */
function adaptProperty(filter: Extract<SelectorFilter, { kind: 'property' }>): QueryFilterLike | string {
  const { pset, prop, op, value, text } = filter;

  for (const [part, label] of [[pset, 'property set name'], [prop, 'property name']] as const) {
    if (part.kind === 'regex') {
      return `${quote(text)}: a regular expression ${label} has no target — psetName/propName match by exact string only`;
    }
  }
  const psetName = (pset as Extract<SelectorText, { kind: 'string' }>).text;
  const propName = (prop as Extract<SelectorText, { kind: 'string' }>).text;

  if (value.kind === 'null') {
    if (op === '!=') return { psetName, propName, operator: 'exists' };
    return `${quote(text)}: "${op} NULL" has no target — only "!= NULL" (exists) does`;
  }

  if (value.kind === 'regex') {
    if (op !== '=') {
      return `${quote(text)}: "${op}" against a regular expression has no target — only "=" (matches) does`;
    }
    return { psetName, propName, operator: 'matches', value: value.source };
  }

  const operator = mapStringOp(op);
  if (!operator) return `${quote(text)}: "${op}" has no target in a QueryDescriptor's ComparisonOp set`;
  return { psetName, propName, operator, value: value.text };
}

function mapStringOp(op: SelectorOp): FilterComparisonOp | undefined {
  switch (op) {
    case '=': return '=';
    case '!=': return '!=';
    case '>': return '>';
    case '>=': return '>=';
    case '<': return '<';
    case '<=': return '<=';
    case '*=': return 'contains';
    default: return undefined; // '!*=' — not-contains, no target
  }
}

function quote(text: string): string {
  return JSON.stringify(text);
}
