#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Generate the IFC2X3 REQUIRED-SLOT table both schema converters read when
 * they downgrade a file to IFC2X3 (#4714):
 *
 *   rust/export/src/generated/ifc2x3_required_slots.rs
 *   packages/export/src/generated/ifc2x3-required-slots.ts
 *
 * WHY THIS EXISTS. IFC4 made attributes optional that IFC2X3 declares
 * mandatory, so a valid IFC4 record legitimately carries `$` in a slot the
 * IFC2X3 target requires a value in. #4686 fixed `IfcRoot.OwnerHistory`, the
 * one such slot with a reuse policy (point it at an `IfcOwnerHistory` the
 * export already writes). The rest — `IfcProject.UnitsInContext`, the profile
 * defs' `Position`, `CompositionType`, `DestabilizingLoad`, `PredefinedType`
 * on a dozen types — had no policy at all and no table to drive one from.
 * Both converters had a HAND-KEPT four-entry map
 * (`IFC2X3_MANDATORY_DEFAULTS` / `ifc2x3_mandatory_default`) covering only the
 * IfcDoorStyle/IfcWindowStyle rename's own target slots. This table replaces
 * it: one generated home per language, derived from the schemas themselves.
 *
 * WHAT A ROW SAYS. One row per CONCRETE IFC2X3 entity that has at least one
 * required slot, carrying the entity's total attribute count and, per required
 * slot, its index, its EXPRESS attribute name, and the value a downgrade may
 * write there when the record's own value is `$`:
 *
 *   - an enum whose IFC2X3 declaration has a `NOTDEFINED` member -> `.NOTDEFINED.`
 *   - a BOOLEAN (directly, or through a defined type such as `IfcBoolean`) -> `.F.`
 *   - anything else -> NO fill. The slot keeps `$` and the converter counts it,
 *     so the caller learns the file is not valid IFC2X3 instead of receiving an
 *     invented measure, label or entity reference.
 *
 * LOGICAL is deliberately in the third group even though `.U.` exists: `.U.`
 * is a claim ("unknown") a reader acts on, not the absence of one, and the
 * maintainer's decision on #4714 named enums and booleans only.
 *
 * WHY EVERY REQUIRED SLOT AND NOT JUST THE ONES IFC4 MADE OPTIONAL. #4714
 * describes the defect class as "optional in IFC4, required in IFC2X3". That
 * difference is not computable from the two schemas alone: a downgrade also
 * RENAMES entities (IfcDoorType -> IfcDoorStyle), so the IFC4 entity that
 * feeds an IFC2X3 target is not always the same-named one, and the rename map
 * lives in the converters rather than in any schema. The rows below are a
 * strict superset of that difference, reached without the rename map. The
 * extra slots — required in IFC4 too — can only fire on a record whose source
 * was ALREADY invalid, where writing the schema's own `.NOTDEFINED.`/`.F.` or
 * counting the slot is the same honest answer.
 *
 * `OwnerHistory` is excluded from every row: #4686 owns that slot, with a
 * policy this table cannot express (reuse a record the export writes), and a
 * row here would count the same `$` twice.
 *
 * SOURCE OF TRUTH. `packages/parser/src/generated/ifc2x3/schema-registry.ts`
 * and `packages/parser/src/generated/schema-registry.ts` — the EXPRESS-derived
 * runtime metadata `packages/codegen` produces from the committed
 * `IFC2X3_TC1.exp` / `IFC4_ADD2_TC1.exp`, and the only tables in this repo
 * that carry per-attribute `optional` flags. `--check` also verifies that each
 * row's attribute-NAME list matches `packages/data/src/ifc-schema/generated/
 * entities-ifc2x3.ts`, the table the TypeScript converter uses to decide a
 * downgraded record's arity: the slot INDEXES below are only meaningful if the
 * two agree, and they agree on all 653 entities as of 2026-09.
 *
 * Run: `node scripts/generate-ifc2x3-required-slots.mjs` to write both files,
 * `--check` to verify they are up to date.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), '..');

// The registries are TypeScript. Re-exec under the `tsx` loader already a
// workspace devDependency rather than re-implementing a TS parser here, so the
// generator reads exactly the module the runtime does.
if (!process.env.IFC2X3_REQUIRED_SLOTS_TSX) {
  const loader = createRequire(SELF).resolve('tsx');
  try {
    execFileSync(process.execPath, ['--import', loader, SELF, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, IFC2X3_REQUIRED_SLOTS_TSX: '1' },
    });
  } catch (err) {
    process.exit(typeof err.status === 'number' ? err.status : 1);
  }
  process.exit(0);
}

const RS_REL = 'rust/export/src/generated/ifc2x3_required_slots.rs';
const TS_REL = 'packages/export/src/generated/ifc2x3-required-slots.ts';

// `pathToFileURL`, not the bare path: Node's ESM loader parses a Windows
// `C:\...` specifier as protocol `c:` and refuses it with
// ERR_UNSUPPORTED_ESM_URL_SCHEME, so this generator and its `--check` would
// fail before reading either registry (CodeRabbit on PR #4750).
const { SCHEMA_REGISTRY: IFC2X3 } = await import(
  pathToFileURL(join(ROOT, 'packages/parser/src/generated/ifc2x3/schema-registry.ts')).href
);
const { ENTITIES_IFC2X3 } = await import(
  pathToFileURL(join(ROOT, 'packages/data/src/ifc-schema/generated/entities-ifc2x3.ts')).href
);

/** Follow a chain of IFC2X3 defined types down to its EXPRESS base type. */
function underlyingType(name) {
  const seen = new Set();
  let type = name;
  while (IFC2X3.types[type] !== undefined && !seen.has(type)) {
    seen.add(type);
    type = IFC2X3.types[type];
  }
  return type;
}

/** The value a downgrade may write into this required slot, or null. */
function fillFor(attr) {
  const members = IFC2X3.enums[attr.type];
  if (members) return members.includes('NOTDEFINED') ? '.NOTDEFINED.' : null;
  return underlyingType(attr.type) === 'BOOLEAN' ? '.F.' : null;
}

function buildRows() {
  const rows = [];
  for (const [name, entity] of Object.entries(IFC2X3.entities)) {
    if (entity.isAbstract) continue;
    const attributes = entity.allAttributes ?? [];
    const slots = [];
    attributes.forEach((attr, index) => {
      // `OwnerHistory` is #4686's slot; see the header.
      if (attr.optional || attr.name === 'OwnerHistory') return;
      slots.push({ index, name: attr.name, fill: fillFor(attr) });
    });
    if (slots.length === 0) continue;
    rows.push({ type: name.toUpperCase(), arity: attributes.length, slots });
  }
  rows.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  return rows;
}

/**
 * The converters index a downgraded record's slots positionally, so a row's
 * indexes are only usable if the registry's attribute order is the order the
 * converter's own arity table uses. Disagreement is a hard failure rather than
 * a silently skipped entity: a wrong index writes `.NOTDEFINED.` over a value.
 */
function verifyAgainstConverterTable(rows) {
  const byType = new Map();
  for (const entity of ENTITIES_IFC2X3) byType.set(entity.name.toUpperCase(), entity.attributes);
  const problems = [];
  for (const row of rows) {
    const converterNames = byType.get(row.type);
    if (converterNames === undefined) continue; // not in the converter's table at all
    const registryNames = (IFC2X3.entities[
      Object.keys(IFC2X3.entities).find((k) => k.toUpperCase() === row.type)
    ].allAttributes ?? []).map((a) => a.name);
    const same =
      registryNames.length === converterNames.length &&
      registryNames.every((n, i) => n === converterNames[i]);
    if (!same) problems.push(`${row.type}: registry [${registryNames}] vs data [${converterNames}]`);
  }
  return problems;
}

const HEADER_WHY =
  'Slots IFC2X3 declares MANDATORY, per concrete entity, for the schema\n\
//! downgrade in `schema_convert` (#4714). A record the source wrote `$` in\n\
//! takes the recorded fill when the schema has an honest one (an enum with a\n\
//! `NOTDEFINED` member, or a BOOLEAN), and is COUNTED when it has none.\n\
//!\n\
//! `OwnerHistory` is not here: #4686 fills it by reusing an `IfcOwnerHistory`\n\
//! the export writes, a policy no default can express.';

function renderRust(rows) {
  const lines = [];
  lines.push('// This Source Code Form is subject to the terms of the Mozilla Public');
  lines.push('// License, v. 2.0. If a copy of the MPL was not distributed with this');
  lines.push('// file, You can obtain one at https://mozilla.org/MPL/2.0/.');
  lines.push('');
  lines.push(`//! ${HEADER_WHY}`);
  lines.push('//!');
  lines.push('//! Generated by `scripts/generate-ifc2x3-required-slots.mjs` from');
  lines.push('//! `packages/parser/src/generated/ifc2x3/schema-registry.ts`. Twin of');
  lines.push('//! `packages/export/src/generated/ifc2x3-required-slots.ts`.');
  lines.push('//!');
  lines.push('//! DO NOT EDIT - regenerate with');
  lines.push('//!   node scripts/generate-ifc2x3-required-slots.mjs');
  lines.push('');
  lines.push('/// `(index, attribute name, fill)`; an EMPTY fill means IFC2X3 requires a value');
  lines.push('/// the downgrade must not invent.');
  lines.push("pub type Ifc2x3RequiredSlot = (u8, &'static str, &'static str);");
  lines.push('');
  lines.push('/// `(UPPERCASE entity name, total attribute count, required slots)`.');
  lines.push("pub type Ifc2x3RequiredSlotRow = (&'static str, u8, &'static [Ifc2x3RequiredSlot]);");
  lines.push('');
  lines.push('/// Every concrete IFC2X3 entity with at least one mandatory slot, sorted by');
  lines.push('/// name for binary search.');
  lines.push('pub static IFC2X3_REQUIRED_SLOTS: &[Ifc2x3RequiredSlotRow] = &[');
  for (const row of rows) {
    const slots = row.slots
      .map((s) => `(${s.index}, "${s.name}", "${s.fill ?? ''}")`)
      .join(', ');
    lines.push(`    ("${row.type}", ${row.arity}, &[${slots}]),`);
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

function renderTs(rows) {
  const lines = [];
  lines.push('/* This Source Code Form is subject to the terms of the Mozilla Public');
  lines.push(' * License, v. 2.0. If a copy of the MPL was not distributed with this');
  lines.push(' * file, You can obtain one at https://mozilla.org/MPL/2.0/. */');
  lines.push('');
  lines.push('/**');
  lines.push(' * Slots IFC2X3 declares MANDATORY, per concrete entity, for the schema');
  lines.push(' * downgrade in `schema-converter.ts` (#4714). A record the source wrote `$`');
  lines.push(' * in takes the recorded fill when the schema has an honest one (an enum with');
  lines.push(' * a `NOTDEFINED` member, or a BOOLEAN), and is COUNTED when it has none.');
  lines.push(' *');
  lines.push(' * `OwnerHistory` is not here: #4686 fills it by reusing an `IfcOwnerHistory`');
  lines.push(' * the export writes, a policy no default can express.');
  lines.push(' *');
  lines.push(' * Generated by `scripts/generate-ifc2x3-required-slots.mjs` from');
  lines.push(' * `packages/parser/src/generated/ifc2x3/schema-registry.ts`. Twin of');
  lines.push(' * `rust/export/src/generated/ifc2x3_required_slots.rs`.');
  lines.push(' *');
  lines.push(' * DO NOT EDIT - regenerate with');
  lines.push(' *   node scripts/generate-ifc2x3-required-slots.mjs');
  lines.push(' */');
  lines.push('');
  lines.push('/** `[index, attribute name, fill]`; a null fill means IFC2X3 requires a value');
  lines.push(' *  the downgrade must not invent. */');
  lines.push('export type Ifc2x3RequiredSlot = readonly [number, string, string | null];');
  lines.push('');
  lines.push('/** `[UPPERCASE entity name, total attribute count, required slots]`. */');
  lines.push('export type Ifc2x3RequiredSlotRow = readonly [string, number, readonly Ifc2x3RequiredSlot[]];');
  lines.push('');
  lines.push('export const IFC2X3_REQUIRED_SLOTS: readonly Ifc2x3RequiredSlotRow[] = [');
  for (const row of rows) {
    const slots = row.slots
      .map((s) => `[${s.index}, '${s.name}', ${s.fill === null ? 'null' : `'${s.fill}'`}]`)
      .join(', ');
    lines.push(`  ['${row.type}', ${row.arity}, [${slots}]],`);
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

const rows = buildRows();
if (rows.length === 0) {
  console.error('generate-ifc2x3-required-slots: the registry yielded ZERO rows; refusing to write.');
  process.exit(1);
}
const problems = verifyAgainstConverterTable(rows);
if (problems.length > 0) {
  console.error(
    'generate-ifc2x3-required-slots: the IFC2X3 registry and the converter attribute table ' +
      'disagree on attribute ORDER, so a slot index here would name the wrong value:\n  ' +
      problems.join('\n  '),
  );
  process.exit(1);
}

const outputs = [
  [RS_REL, renderRust(rows)],
  [TS_REL, renderTs(rows)],
];

if (process.argv.includes('--check')) {
  let stale = false;
  for (const [rel, text] of outputs) {
    let committed;
    try {
      committed = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      console.error(`generate-ifc2x3-required-slots --check: ${rel} is missing.`);
      stale = true;
      continue;
    }
    if (committed !== text) {
      console.error(`generate-ifc2x3-required-slots --check: ${rel} is out of date.`);
      stale = true;
    }
  }
  if (stale) {
    console.error('Run: node scripts/generate-ifc2x3-required-slots.mjs');
    process.exit(1);
  }
  const slots = rows.reduce((n, r) => n + r.slots.length, 0);
  console.log(`generate-ifc2x3-required-slots --check: OK (${rows.length} entities, ${slots} slots)`);
  process.exit(0);
}

for (const [rel, text] of outputs) {
  mkdirSync(dirname(join(ROOT, rel)), { recursive: true });
  writeFileSync(join(ROOT, rel), text);
  console.log(`generate-ifc2x3-required-slots: wrote ${rel}`);
}
