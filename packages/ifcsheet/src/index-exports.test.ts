/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The package's public export surface is pinned: `src/index.ts` is split into
 * themed sub-barrels (`src/exports/`), and `export *` silently drops a name two
 * barrels both export, so the surface is compared name by name with the list
 * in `index-exports.snapshot.json`. Each entry is the export name, whether its
 * meaning is a value, a type or both, and whether it is exported type-only.
 *
 * An intended change to the public API: `IFCSHEET_SURFACE_UPDATE=1 vitest run src/index-exports.test.ts`
 * and commit the snapshot diff.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const SNAPSHOT = fileURLToPath(new URL('./index-exports.snapshot.json', import.meta.url));

function exportSurface(entry: string): string[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    noEmit: true,
    types: ['node'],
  };
  const program = ts.createProgram([entry], options);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (!source) throw new Error(`cannot read ${entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${entry} has no exports`);
  // `export *` of a name two barrels both declare is error 2308, and the checker keeps one of them,
  // so the name list alone would not show it.
  const problems = program.getSemanticDiagnostics(source).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
  if (problems.length > 0) throw new Error(`${entry}: ${problems.join('; ')}`);
  const rows: string[] = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    let typeOnly = false;
    let probe: ts.Symbol = symbol;
    while (probe.flags & ts.SymbolFlags.Alias) {
      for (const declaration of probe.declarations ?? []) {
        if (ts.isTypeOnlyImportOrExportDeclaration(declaration)) typeOnly = true;
      }
      probe = checker.getAliasedSymbol(probe);
    }
    const meaning = [
      probe.flags & ts.SymbolFlags.Value ? 'value' : '',
      probe.flags & ts.SymbolFlags.Type ? 'type' : '',
    ].filter(Boolean).join('+') || 'other';
    rows.push(`${symbol.name}: ${meaning}${typeOnly ? ' (type-only)' : ''}`);
  }
  return rows.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

describe('the package index', () => {
  it('exports exactly the pinned surface', () => {
    const surface = exportSurface(`${SRC}index.ts`);
    if (process.env.IFCSHEET_SURFACE_UPDATE === '1') {
      writeFileSync(SNAPSHOT, `${JSON.stringify(surface, null, 2)}\n`);
    }
    const pinned = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as string[];
    expect(pinned.length).toBeGreaterThan(400);
    expect(surface).toEqual(pinned);
  });
});
