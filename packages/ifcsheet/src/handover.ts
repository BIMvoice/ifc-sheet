/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The handover package (#83): the issued PDF, a DXF per sheet, the IFC as loaded, every schedule as XLSX and the drawing register,
 * in one ZIP. This module is the one builder of the names and of the archive; the app (`issue/handover.ts`) and the command line
 * (`ifcsheet build --handover`) each collect the files and hand them here, so the two cannot name them differently.
 *
 * A file's name comes from a pattern of tokens, `{project} {number} {sheet} {revision} {date} {issue}`, stored with the project
 * (`handoverPattern`). The name is made safe: plain ASCII (diacritics folded, `ș` becomes `s`), no path separators or reserved
 * characters, no more than {@link HANDOVER_NAME_MAX} characters with its extension, and a name two files would share gets ` (2)`.
 * Pure apart from the archive: no DOM, no Node.
 */

import { zipSync } from 'fflate';

/** The default pattern: a sheet's number and title (`A-101 Ground floor.dxf`), a set-level file its own title (`Issue 1.pdf`), as the issue names files today. */
export const HANDOVER_DEFAULT_PATTERN = '{number} {sheet}';

export const HANDOVER_TOKENS = ['project', 'number', 'sheet', 'revision', 'date', 'issue'] as const;
export type HandoverToken = (typeof HANDOVER_TOKENS)[number];
export type HandoverTokens = Partial<Record<HandoverToken, string>>;

/** Longest file name, extension included. */
export const HANDOVER_NAME_MAX = 100;
/** Longest pattern the project keeps. */
export const HANDOVER_PATTERN_MAX = 200;

export type HandoverKind = 'pdf' | 'dxf' | 'ifc' | 'schedule' | 'register';

/** One file of the package before it is named. `tokens` are the values the pattern reads for this file; a token left out is empty. */
export interface HandoverPart {
  kind: HandoverKind;
  /** Without the dot: `pdf`, `dxf`, `ifc`, `xlsx`. */
  extension: string;
  tokens: HandoverTokens;
  data: Uint8Array;
}

export interface HandoverFile {
  name: string;
  kind: HandoverKind;
  data: Uint8Array;
}

/** Letters NFD does not take apart. */
const FOLD: Record<string, string> = { ß: 'ss', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ð: 'd', þ: 'th' };
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const SEPARATORS = /^[\s._-]+/;
const tokenPattern = /\{(\w+)\}/g;

/** `text` as a plain ASCII file-name stem: diacritics folded, anything else a file name cannot hold becomes `-`, trimmed, cut to `maxLength`. */
export function asciiStem(text: string, maxLength = HANDOVER_NAME_MAX): string {
  const folded = text.replace(/[ßøØđĐłŁæÆœŒðþ]/g, (c) => FOLD[c] ?? c).normalize('NFD').replace(/\p{M}+/gu, '');
  const cleaned = folded
    // A comma and the space after it read as the word break they are (`Elevations, south` is `Elevations south`), as the issue's file names have always done.
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/^[\s._-]+|[\s._-]+$/g, '')
    .slice(0, Math.max(1, maxLength))
    .replace(/[\s._-]+$/, '');
  if (!cleaned) return '';
  return RESERVED.test(cleaned) ? `${cleaned}_` : cleaned;
}

/** The stem the pattern makes for `tokens`: a token with no value is left out together with the separator after it (`{number} - {sheet}` without a number is the sheet). */
function applyPattern(pattern: string, tokens: HandoverTokens): string {
  let out = '';
  let dropSeparator = false;
  let last = 0;
  const literal = (text: string) => {
    if (!dropSeparator) { out += text; return; }
    const rest = text.replace(SEPARATORS, '');
    out += rest;
    dropSeparator = rest === '';
  };
  for (const m of pattern.matchAll(tokenPattern)) {
    literal(pattern.slice(last, m.index));
    last = m.index + m[0].length;
    const known = (HANDOVER_TOKENS as readonly string[]).includes(m[1]);
    const value = known ? (tokens[m[1] as HandoverToken] ?? '').trim() : '';
    if (value) { out += value; dropSeparator = false; } else dropSeparator = true;
  }
  literal(pattern.slice(last));
  return out;
}

/** A file's name: the pattern applied to `tokens`, made safe, with `.extension`. `fallback` names a file the pattern leaves nameless. */
export function handoverFileName(pattern: string, tokens: HandoverTokens, extension: string, fallback = 'file'): string {
  const ext = asciiStem(extension, 16).toLowerCase() || 'dat';
  const budget = HANDOVER_NAME_MAX - ext.length - 1;
  return `${asciiStem(applyPattern(pattern, tokens), budget) || asciiStem(fallback, budget) || 'file'}.${ext}`;
}

/** A project's stored pattern, or `undefined` for one that is not usable (an old project has none; the default applies). */
export function readHandoverPattern(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const pattern = raw.trim();
  return pattern && pattern.length <= HANDOVER_PATTERN_MAX ? pattern : undefined;
}

/** The names, in the order given; a name a file already has (case aside, as a file system sees it) gets ` (2)`, ` (3)`, kept within the length limit. */
export function uniqueHandoverNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 1; ; n++) {
      const suffix = n === 1 ? '' : ` (${n})`;
      const candidate = `${stem.slice(0, Math.max(1, HANDOVER_NAME_MAX - ext.length - suffix.length)).replace(/[\s._-]+$/, '')}${suffix}${ext}`;
      if (!used.has(candidate.toLowerCase())) { used.add(candidate.toLowerCase()); return candidate; }
    }
  });
}

/** Name every part by the pattern (the default when `pattern` is absent or unusable). */
export function nameHandoverFiles(pattern: string | undefined, parts: readonly HandoverPart[]): HandoverFile[] {
  const use = readHandoverPattern(pattern) ?? HANDOVER_DEFAULT_PATTERN;
  const names = uniqueHandoverNames(parts.map((p) => handoverFileName(use, p.tokens, p.extension, p.kind)));
  return parts.map((p, i) => ({ name: names[i], kind: p.kind, data: p.data }));
}

/** The package: the parts named by the pattern, as one ZIP. */
export function buildHandoverZip(pattern: string | undefined, parts: readonly HandoverPart[]): { zip: Uint8Array; files: HandoverFile[] } {
  const files = nameHandoverFiles(pattern, parts);
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = f.data;
  return { zip: zipSync(entries), files };
}
