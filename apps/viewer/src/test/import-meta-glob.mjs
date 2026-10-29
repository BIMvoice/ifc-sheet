/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vite's `import.meta.glob` for the node test runner, for the patterns a
 * registry uses to find its entries: one file per entry, discovered, so two
 * PRs adding different entries never edit the same line. Vite rewrites the
 * call at build time; under `tsx --test` nothing does, so `vite-module-hooks-impl.mjs`
 * runs `transformImportMetaGlob` on every repo module that calls it.
 *
 * Only a subset is rewritten, the one whose meaning is plain:
 *   - patterns: a string literal or an array of them, each relative to the
 *     importing file (`./`, `../`), `!` in front to exclude, and `*` only in
 *     the file name (no `**`, `?`, braces or character classes);
 *   - options: none, or an object literal with `eager` (boolean) and `import`
 *     (string) only.
 * A call outside that subset is left as it is, so it fails at run time exactly
 * as it did before this file existed (`import.meta.glob` is not a function);
 * nothing is approximated. The result, like Vite's, is an object keyed by the
 * path as the pattern spells it (`./locales/ro.ts`), in the order of the files'
 * absolute paths; the importing file is never one of its own matches (Vite 8's
 * `filter((file) => file !== id).sort()`).
 *
 * Pure node: it runs on the module-loader thread and must not import the app.
 */

import { readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const CALL = 'import.meta.glob(';
const OPTION_KEYS = new Set(['eager', 'import']);

/** The text between the parenthesis at `open` and its match, skipping strings and comments; -1 when unbalanced. */
function closingParen(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < source.length && source[i] !== c; i += 1) if (source[i] === '\\') i += 1;
    } else if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) return -1;
      i = end + 1;
    } else if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `[patterns, options]` when the argument text is literals in the supported subset, else null. */
export function parseGlobArguments(text) {
  let args;
  try {
    // Literals only: a name or a call throws in the empty context. Copied out of the context's realm as JSON.
    args = JSON.parse(JSON.stringify(vm.runInNewContext(`[${text}]`, Object.create(null), { timeout: 100 })));
  } catch {
    return null;
  }
  if (!Array.isArray(args) || args.length < 1 || args.length > 2) return null;
  const patterns = typeof args[0] === 'string' ? [args[0]] : args[0];
  if (!Array.isArray(patterns) || patterns.length === 0 || !patterns.every(isSupportedPattern)) return null;
  const options = args[1] ?? {};
  if (typeof options !== 'object' || options === null || Array.isArray(options)) return null;
  if (!Object.keys(options).every((k) => OPTION_KEYS.has(k))) return null;
  if (options.eager !== undefined && typeof options.eager !== 'boolean') return null;
  if (options.import !== undefined && typeof options.import !== 'string') return null;
  return [patterns, { eager: options.eager === true, import: options.import }];
}

function isSupportedPattern(pattern) {
  if (typeof pattern !== 'string') return false;
  const body = pattern.startsWith('!') ? pattern.slice(1) : pattern;
  if (!body.startsWith('./') && !body.startsWith('../')) return false;
  if (/[?{}[\]()!]/.test(body) || body.includes('**')) return false;
  return !posix.dirname(body).includes('*');
}

/** A file-name pattern with `*` as a regular expression. */
const nameRegex = (name) => new RegExp(`^${name.split('*').map((part) => part.replace(/[.+^$|\\]/g, '\\$&')).join('[^/]*')}$`);

/**
 * The files `patterns` match from `importer` (an absolute path), as `[key, absolutePath]` sorted by path; `importer`
 * itself is never among them. `patterns` must be in the supported subset (`parseGlobArguments`).
 */
export function expandGlob(importer, patterns) {
  const base = dirname(importer);
  const matches = new Map();
  for (const pattern of patterns.filter((p) => !p.startsWith('!'))) {
    const dir = posix.dirname(pattern);
    const regex = nameRegex(posix.basename(pattern));
    let names;
    try {
      names = readdirSync(join(base, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const file = join(base, dir, name);
      if (!regex.test(name) || file === importer || !statSync(file).isFile()) continue;
      matches.set(`${dir}/${name}`, file);
    }
  }
  for (const pattern of patterns.filter((p) => p.startsWith('!'))) {
    const body = pattern.slice(1);
    const dir = posix.dirname(body);
    const regex = nameRegex(posix.basename(body));
    for (const key of [...matches.keys()]) if (posix.dirname(key) === dir && regex.test(posix.basename(key))) matches.delete(key);
  }
  // Vite sorts the matched files by absolute path (and drops the importer), so the keys come out in that order.
  return [...matches].sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** `source` with every comment and string literal blanked to spaces (newlines kept), so a call is only found in code. */
function codeOnly(source) {
  const out = source.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      for (i += 1; i < source.length && source[i] !== c; i += 1) if (source[i] === '\\') i += 1;
      blank(start, i + 1);
    } else if (c === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n') i += 1;
      blank(start, i);
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      blank(i, stop);
      i = stop - 1;
    }
  }
  return out.join('');
}

/**
 * Every supported `import.meta.glob(...)` call of a module (in its code, not its comments or strings), as its
 * patterns and options. The session's import guard walks these as it walks static imports.
 */
export function globCalls(source) {
  const calls = [];
  const code = codeOnly(source);
  for (let at = code.indexOf(CALL); at >= 0; at = code.indexOf(CALL, at + CALL.length)) {
    const open = at + CALL.length - 1;
    const close = closingParen(source, open);
    if (close < 0) break;
    const parsed = parseGlobArguments(source.slice(open + 1, close));
    if (parsed) calls.push({ start: at, end: close + 1, patterns: parsed[0], options: parsed[1] });
  }
  return calls;
}

/**
 * `source` (the JavaScript of the module at `url`) with each supported `import.meta.glob(...)` call replaced by what
 * Vite would build: eager, an object of the matched modules (or their `import` export) imported statically; lazy, an
 * object of functions importing them. The static imports are appended, so line numbers do not move. Returns null when
 * the module has no supported call.
 */
export function transformImportMetaGlob(source, url) {
  if (!source.includes(CALL)) return null;
  const calls = globCalls(source);
  if (calls.length === 0) return null;
  const importer = fileURLToPath(url);
  const imports = [];
  let out = '';
  let last = 0;
  calls.forEach((call, i) => {
    const entries = expandGlob(importer, call.patterns).map(([key, file], j) => {
      const href = JSON.stringify(pathToFileURL(file).href);
      const pick = call.options.import === undefined ? '' : `[${JSON.stringify(call.options.import)}]`;
      if (!call.options.eager) {
        const then = call.options.import === undefined ? '' : `.then((m) => m${pick})`;
        return `${JSON.stringify(key)}: () => import(${href})${then}`;
      }
      const name = `__importMetaGlob_${i}_${j}`;
      imports.push(`import * as ${name} from ${href};`);
      return `${JSON.stringify(key)}: ${name}${pick}`;
    });
    out += `${source.slice(last, call.start)}({ ${entries.join(', ')} })`;
    last = call.end;
  });
  out += source.slice(last);
  return imports.length > 0 ? `${out}\n${imports.join('\n')}\n` : out;
}
