/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which English catalogue keys the IfcSheet face can reach, and which of those
 * have no Romanian. Walks the import graph from `IfcSheetShell.tsx` (static and
 * dynamic imports, resolved with the viewer's tsconfig path aliases) and reads
 * every string literal in the files it reaches:
 *
 *   - `exact`: the literal IS an English key (a `t('...')` call, a key held in a
 *     table, a `labelKey: '...'` field).
 *   - `viaPrefix`: a template or concatenation whose literal head is a prefix of
 *     English keys (`t(`wall.${x}`)`): every key under the prefix is counted,
 *     separately, because the static pass cannot say which of them is hit.
 *
 * Writes `scripts/ro-reachable-missing.json`. Run from `apps/viewer`:
 *   pnpm exec tsx --import ./src/test/vite-module-hooks.mjs ../../scripts/lib/ro-reachable-probe.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { en } from '../../apps/viewer/src/i18n/en';
import ro from '../../apps/viewer/src/i18n/locales/ro';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIEWER = join(REPO, 'apps', 'viewer');
const ENTRY = join(VIEWER, 'src/components/viewer/ifcsheet/IfcSheetShell.tsx');

const cfg = ts.readConfigFile(join(VIEWER, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, VIEWER);
const options = parsed.options;
const host = ts.createCompilerHost(options);

const enKeys = new Set(Object.keys(en));
const roKeys = new Set(Object.keys(ro));
const allKeys = [...enKeys].sort();

const seen = new Set<string>();
const queue = [ENTRY];
const exact = new Map<string, Set<string>>();
const prefixes = new Map<string, Set<string>>();
const add = (m: Map<string, Set<string>>, k: string, file: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(file);

function specifiers(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) out.push((n.arguments[0] as ts.StringLiteralLike).text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

while (queue.length) {
  const file = queue.pop()!;
  if (seen.has(file)) continue;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = relative(VIEWER, file);
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) && enKeys.has(n.text)) add(exact, n.text, rel);
    else if (ts.isTemplateExpression(n) && n.head.text) add(prefixes, n.head.text, rel);
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isStringLiteralLike(n.left) && !ts.isStringLiteralLike(n.right)) add(prefixes, n.left.text, rel);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const spec of specifiers(sf)) {
    const hit = ts.resolveModuleName(spec, file, options, host).resolvedModule;
    if (!hit || hit.isExternalLibraryImport) continue;
    const p = hit.resolvedFileName;
    if (p.includes('/node_modules/') || !/\.tsx?$/.test(p) || p.endsWith('.d.ts') || /\.test\.tsx?$/.test(p)) continue;
    // The catalogues name every key as a property: walking them would "reach" all of them.
    if (p.startsWith(REPO) && !p.startsWith(join(VIEWER, 'src', 'i18n') + '/')) queue.push(p);
  }
}

// A prefix counts only when it is at least a dotted segment long and matches keys.
const viaPrefix = new Map<string, Set<string>>();
const unresolved: string[] = [];
for (const [prefix, files] of prefixes) {
  const hits = allKeys.filter((k) => k.startsWith(prefix));
  if (hits.length === 0) {
    if (/^[a-z][A-Za-z0-9]*\.[A-Za-z0-9.]*$/.test(prefix)) unresolved.push(`${prefix} (${[...files][0]})`);
    continue;
  }
  if (prefix.length < 4) continue;
  for (const k of hits) add(viaPrefix, k, prefix);
}

const catalogueOf = (key: string): string => key.split('.')[0];
const group = (keys: string[]) => {
  const out: Record<string, string[]> = {};
  for (const k of keys) (out[catalogueOf(k)] ??= []).push(k);
  return out;
};
const exactKeys = [...exact.keys()].sort();
const prefixOnly = [...viaPrefix.keys()].filter((k) => !exact.has(k)).sort();
const missingExact = exactKeys.filter((k) => !roKeys.has(k));
const missingPrefix = prefixOnly.filter((k) => !roKeys.has(k));
const fileOf = (k: string) => [...(exact.get(k) ?? [])][0] ?? '';

const result = {
  entry: relative(REPO, ENTRY),
  filesReached: seen.size,
  englishKeys: allKeys.length,
  reachableExact: exactKeys.length,
  reachableViaPrefix: prefixOnly.length,
  reachableExactMissingRomanian: missingExact.length,
  reachableViaPrefixMissingRomanian: missingPrefix.length,
  unresolvedPrefixes: unresolved.sort(),
  missingExactByPrefix: group(missingExact),
  missingExactFirstFile: Object.fromEntries(missingExact.map((k) => [k, fileOf(k)])),
  missingViaPrefix: group(missingPrefix),
};
writeFileSync(join(REPO, 'scripts', 'ro-reachable-missing.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, missingExactByPrefix: undefined, missingExactFirstFile: undefined, missingViaPrefix: undefined, byPrefixCounts: Object.fromEntries(Object.entries(result.missingExactByPrefix).map(([k, v]) => [k, v.length])), viaPrefixCounts: Object.fromEntries(Object.entries(result.missingViaPrefix).map(([k, v]) => [k, v.length])) }, null, 1));
