/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The package's public export surface is pinned: `src/index.ts` is split into
 * themed sub-barrels (`src/exports/`), and `export *` silently drops a name two
 * barrels both export, so the surface is compared name by name with the lists
 * in `__snapshots__/exports/<barrel>.txt`, one file per sub-barrel so PRs adding to different barrels do not collide. Each entry is the export name, whether its
 * meaning is a value, a type or both, and whether it is exported type-only.
 *
 * An intended change to the public API: run the update command the failure prints and commit the snapshot diff.
 */

import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));

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

const SNAPSHOT_DIR = fileURLToPath(new URL('./__snapshots__/exports/', import.meta.url));
const UPDATE = 'IFCSHEET_SURFACE_UPDATE=1 pnpm --filter @bimvoice/ifcsheet exec vitest run src/index-exports.test.ts';

function barrels(): string[] {
  return readdirSync(`${SRC}exports`).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => f.slice(0, -3)).sort();
}

describe('the package index', () => {
  it('exports exactly the pinned surface, one snapshot file per sub-barrel', () => {
    const names = barrels();
    const surfaces = new Map(names.map((n) => [n, exportSurface(`${SRC}exports/${n}.ts`)]));
    if (process.env.IFCSHEET_SURFACE_UPDATE === '1') {
      mkdirSync(SNAPSHOT_DIR, { recursive: true });
      for (const f of readdirSync(SNAPSHOT_DIR)) if (!surfaces.has(f.replace(/\.txt$/, ''))) unlinkSync(`${SNAPSHOT_DIR}${f}`);
      for (const [n, rows] of surfaces) writeFileSync(`${SNAPSHOT_DIR}${n}.txt`, `${rows.join('\n')}\n`);
    }
    const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)).sort();
    expect(files, `snapshot files in __snapshots__/exports/ must match the sub-barrels in src/exports/; update with: ${UPDATE}`).toEqual(names);
    for (const [n, rows] of surfaces) {
      const pinned = readFileSync(`${SNAPSHOT_DIR}${n}.txt`, 'utf8').split('\n').filter(Boolean);
      expect(rows, `src/exports/${n}.ts differs from __snapshots__/exports/${n}.txt; update with: ${UPDATE}`).toEqual(pinned);
    }
    // The index is the union of the sub-barrels: nothing exported straight from index.ts, and no name two
    // barrels both export (the checker would keep one of them).
    const union = [...surfaces.values()].flat().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(exportSurface(`${SRC}index.ts`), 'src/index.ts must export exactly the union of the sub-barrels').toEqual(union);
    expect(union.length).toBeGreaterThan(400);
  });
});
