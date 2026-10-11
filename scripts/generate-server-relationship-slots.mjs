#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Generates the Rust relationship attribute-slot table the parse server uses
 * to extract `RelatingX`/`RelatedY` from every `IfcRelationship` subtype
 * (issue #4205 Rust parity).
 *
 * Before this generator, `apps/server/src/services/data_model/relationships.rs`
 * hand-enumerated 13 STEP relationship types and a hand-written
 * `(relating_idx, related_idx)` match, falling back to a default `(4,5)` for
 * anything else — wrong for several real subtypes (e.g. the `IfcRelAssigns`
 * family puts `RelatedObjects` before `RelatingX`), and silently dropping
 * every relationship type outside that hand-picked 13.
 *
 * This mirrors `scripts/generate-server-attr-indices.mjs`'s precedent
 * (issue #1765): derive the Rust table from the SAME schema-derived source
 * the TS/WASM path resolves relationship slots against —
 * `getAllConcreteRelationshipTypes()` / `getRelationshipSlotPlan()` in
 * `@ifc-lite/parser`'s `relationship-schema-slots.ts` (issue #4672). That
 * module returns 0-based indices AFTER the 4 shared IfcRoot+IfcRelationship
 * attributes (GlobalId, OwnerHistory, Name, Description); this script adds
 * `ROOT_ATTR_COUNT` back to get the ABSOLUTE attribute position
 * `DecodedEntity::get_ref`/`get_list` expect.
 *
 * Regenerate after a schema-registry change:
 *   pnpm turbo build --filter=@ifc-lite/parser && node scripts/generate-server-relationship-slots.mjs
 *   (then `cargo fmt -p ifc-lite-server` — the emitted arms are single-line)
 *
 * `--check` compares the committed file's per-type slots against a fresh
 * derivation and exits 1 on drift. The comparison is SEMANTIC (parses the
 * slots out of the committed arms via regex), so it's immune to rustfmt
 * reflowing the single-line arms into multiple lines — no Rust toolchain
 * required in CI, same discipline as the attr-indices precedent.
 *
 * ANTI-VACUITY: `getAllConcreteRelationshipTypes` unions per-version concrete
 * subtype sets read off a live import of `packages/parser/dist`. A stale or
 * half-built dist that resolves cleanly but exports an empty/near-empty
 * registry would otherwise write (or bless) a `match` with almost no arms,
 * silently regressing every relationship type back to "unknown" in the
 * server-parse path. TYPE_FLOOR guards against that the same way ROW_FLOOR
 * guards `generate-server-attr-indices.mjs`.
 *
 * Note on `relationship-schema-slots.ts`'s own note (relationship-schema-
 * slots.ts:112-118): "none of the 46 IFC4/IFC4X3 concrete subtypes" fail to
 * resolve — that carve-out is deliberate. `getAllConcreteRelationshipTypes()`
 * additionally unions in whatever IFC2X3 marks non-abstract, and IFC2X3's
 * bundled registry marks `IfcRelAssociates` (an abstract supertype in every
 * real EXPRESS schema — it declares no `RelatingX` attribute of its own,
 * only the shared `RelatedObjects`) as `isAbstract: false`. That single type
 * has no resolvable slot plan in ANY of the three bundled versions and is
 * skipped here (see UNRESOLVED handling below) rather than silently dropped:
 * this script fails closed if more than one type is ever unresolved, since
 * that would mean a real regression rather than this known, single,
 * documented exception.
 *
 * Output: apps/server/src/services/data_model/generated/relationship_slots.rs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK = process.argv.includes('--check');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { getAllConcreteRelationshipTypes, getRelationshipSlotPlan } = await import(
  join(root, 'packages/parser/dist/relationship-schema-slots.js')
);

// Every `IfcRelationship` subtype's shared IfcRoot+IfcRelationship prefix
// (GlobalId, OwnerHistory, Name, Description) that `relationship-schema-
// slots.ts` indexes AFTER (see its own ROOT_ATTR_COUNT).
const ROOT_ATTR_COUNT = 4;

/**
 * Lower bound on how many concrete relationship types the schema-derived
 * union must yield before this script will write or bless anything.
 *
 * MEASURED, not guessed: a healthy build yields 55 types (54 resolved + the
 * one documented `IFCRELASSOCIATES` exception) as of this writing. The floor
 * is 40 — comfortably under 55 to allow for ordinary schema churn, but far
 * enough above zero/near-zero that a stale or half-built
 * `packages/parser/dist` (which would still import cleanly and return an
 * empty or near-empty Set) cannot slip through.
 */
const TYPE_FLOOR = 40;

/**
 * How many types this script will tolerate leaving unresolved (no slot plan
 * in any bundled schema version) before refusing to proceed. Exactly one is
 * expected and documented above (`IFCRELASSOCIATES`); more than that means a
 * real regression, not the known exception, and must be investigated rather
 * than silently generated around.
 */
const UNRESOLVED_FLOOR = 1;

if (typeof getAllConcreteRelationshipTypes !== 'function' || typeof getRelationshipSlotPlan !== 'function') {
  console.error(
    '❌ packages/parser/dist/relationship-schema-slots.js does not export ' +
      'getAllConcreteRelationshipTypes/getRelationshipSlotPlan — stale or broken build; refusing to ' +
      'derive a relationship-slot table from it.\n' +
      '   Rebuild with `pnpm turbo build --filter=@ifc-lite/parser` and retry.',
  );
  process.exit(1);
}

const allTypes = [...getAllConcreteRelationshipTypes()].sort();

if (allTypes.length < TYPE_FLOOR) {
  console.error(
    `❌ getAllConcreteRelationshipTypes() yielded only ${allTypes.length} type(s); the floor is ` +
      `${TYPE_FLOOR}. Refusing to ${CHECK ? 'compare against' : 'emit'} a relationship-slot table derived ` +
      'from an extraction this thin — a near-empty table would silently regress relationship extraction ' +
      'for every type not in it.\n' +
      '   Rebuild with `pnpm turbo build --filter=@ifc-lite/parser` and retry. If the registry genuinely ' +
      'shrank this far, lower TYPE_FLOOR in the same commit.',
  );
  process.exit(1);
}

const resolved = [];
const unresolved = [];
for (const type of allTypes) {
  const plan = getRelationshipSlotPlan(type);
  if (!plan) {
    unresolved.push(type);
    continue;
  }
  resolved.push({
    type,
    relatingIdx: plan.relating.index + ROOT_ATTR_COUNT,
    relatedIdx: plan.related.index + ROOT_ATTR_COUNT,
    relatingIsList: !!plan.relating.isList,
    relatedIsList: !!plan.related.isList,
  });
}

if (unresolved.length > UNRESOLVED_FLOOR) {
  console.error(
    `❌ ${unresolved.length} concrete relationship type(s) have no resolvable slot plan — more than the ` +
      `documented floor of ${UNRESOLVED_FLOOR} (the known IFCRELASSOCIATES exception, see this script's ` +
      `header). Investigate before regenerating:\n` +
      unresolved.map((t) => `  ${t}`).join('\n'),
  );
  process.exit(1);
}
if (unresolved.length === 1 && unresolved[0] !== 'IFCRELASSOCIATES') {
  console.error(
    `❌ Exactly one type is unresolved, but it isn't the documented exception (IFCRELASSOCIATES): ` +
      `${unresolved[0]}. This is a NEW unresolved type, not the known one — investigate before ` +
      'regenerating.',
  );
  process.exit(1);
}

resolved.sort((a, b) => (a.type < b.type ? -1 : 1));

const arms = resolved
  .map(
    ({ type, relatingIdx, relatedIdx, relatingIsList, relatedIsList }) =>
      `        "${type}" => Some(RelationshipSlots { relating_idx: ${relatingIdx}, related_idx: ${relatedIdx}, relating_is_list: ${relatingIsList}, related_is_list: ${relatedIsList} }),`,
  )
  .join('\n');

const out = `// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Relationship attribute slots per \`IfcRelationship\` subtype (issue #4205).
//!
//! DO NOT EDIT — generated by \`scripts/generate-server-relationship-slots.mjs\`
//! from \`@ifc-lite/parser\`'s schema-derived \`relationship-schema-slots.ts\`
//! (the same source the in-browser/WASM columnar parser resolves relationship
//! slots against), so the server-parse path reads \`RelatingX\`/\`RelatedY\` at
//! IDENTICAL attribute positions.
//!
//! Lookup key is the UPPERCASE STEP type name. Indices are ABSOLUTE attribute
//! positions (i.e. \`relationship-schema-slots.ts\`'s 0-based-after-root index
//! plus the shared 4-attribute IfcRoot+IfcRelationship prefix), matching what
//! \`DecodedEntity::get_ref\`/\`get_list\` expect.
//!
//! \`${resolved.length}\` of \`${allTypes.length}\` schema-derived concrete
//! \`IfcRelationship\` subtypes resolved a slot plan.${
  unresolved.length > 0
    ? ` \`${unresolved.join(', ')}\` did not: it has
//! no \`RelatingX\` attribute of its own in ANY bundled schema version (an
//! abstract supertype that IFC2X3's bundled registry happens to mark
//! non-abstract — see the generator script's header for the full
//! explanation). It is intentionally absent from this table; no concrete
//! STEP file instantiates it directly.`
    : ''
}

/// One relationship type's relating/related attribute slots.
///
/// \`relating_is_list\` is true for exactly one type as of writing —
/// \`IFCRELDEFINESBYPROPERTIES\`: \`RelatingPropertyDefinition\` is typed
/// \`IfcPropertySetDefinitionSelect\`, whose second alternative
/// (\`IfcPropertySetDefinitionSet\`) is a defined \`SET\` of entities, written
/// inline as \`(#20,#21)\` rather than as a single \`#id\`. Reading it with
/// \`get_ref\` alone returns \`None\` for that shape and silently drops the
/// whole relationship — the same failure mode \`related_is_list\` already
/// guards against on the other slot.
#[derive(Debug, Clone, Copy)]
pub struct RelationshipSlots {
    pub relating_idx: u8,
    pub related_idx: u8,
    pub relating_is_list: bool,
    pub related_is_list: bool,
}

/// Relating/related attribute slots for a STEP relationship keyword, or
/// \`None\` if the type is not a schema-derived concrete \`IfcRelationship\`
/// subtype (or is the single documented exception above).
pub fn relationship_slots(upper_type_name: &str) -> Option<RelationshipSlots> {
    match upper_type_name {
${arms}
        _ => None,
    }
}
`;

const outPath = join(root, 'apps/server/src/services/data_model/generated/relationship_slots.rs');

if (CHECK) {
  let committed;
  try {
    committed = readFileSync(outPath, 'utf8');
  } catch {
    console.error(`✗ ${outPath} is missing — run: node scripts/generate-server-relationship-slots.mjs`);
    process.exit(1);
  }
  // Strip comments first so a commented-out arm (dead to Rust) can't be
  // mistaken for a live one by the arm regex below.
  const stripRustComments = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const parseArms = (rawText) => {
    const text = stripRustComments(rawText);
    const map = new Map();
    const dups = new Set();
    const re =
      /"([A-Z0-9_]+)"\s*=>\s*Some\(RelationshipSlots\s*\{\s*relating_idx:\s*(\d+)\s*,\s*related_idx:\s*(\d+)\s*,\s*relating_is_list:\s*(true|false)\s*,\s*related_is_list:\s*(true|false)\s*,?\s*\}\)/g;
    for (const m of text.matchAll(re)) {
      if (map.has(m[1])) dups.add(m[1]);
      else map.set(m[1], [Number(m[2]), Number(m[3]), m[4], m[5]].join(','));
    }
    return { map, dups };
  };
  const expected = new Map(
    resolved.map((r) => [r.type, [r.relatingIdx, r.relatedIdx, String(r.relatingIsList), String(r.relatedIsList)].join(',')]),
  );
  const { map: actual, dups } = parseArms(committed);

  const drift = [];
  for (const k of dups) drift.push(`  duplicate arm (Rust uses the first, unreachable rest): ${k}`);
  for (const [k, v] of expected) {
    if (!actual.has(k)) drift.push(`  missing row: ${k}`);
    else if (actual.get(k) !== v) drift.push(`  ${k}: committed [${actual.get(k)}] != derived [${v}]`);
  }
  for (const k of actual.keys()) if (!expected.has(k)) drift.push(`  stale row (not in derived set): ${k}`);

  if (drift.length > 0) {
    console.error(
      `✗ apps/server/.../generated/relationship_slots.rs is out of sync with @ifc-lite/parser's schema-derived relationship slots.\n` +
        `  Regenerate: pnpm turbo build --filter=@ifc-lite/parser && node scripts/generate-server-relationship-slots.mjs && cargo fmt -p ifc-lite-server\n` +
        `${drift.slice(0, 20).join('\n')}${drift.length > 20 ? `\n  …and ${drift.length - 20} more` : ''}`,
    );
    process.exit(1);
  }
  console.log(`✓ relationship_slots.rs in sync (${expected.size} types, ${unresolved.length} unresolved)`);
  process.exit(0);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(
  `wrote ${outPath} (${resolved.length} of ${allTypes.length} types resolved, ${unresolved.length} unresolved: ${unresolved.join(', ') || 'none'})`,
);
