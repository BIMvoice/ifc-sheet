/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which English keys the source files of the sheet view name (#231). Used by
 * `locales/ro.test.ts` to require a Romanian entry for each. Lives outside the
 * test so the test asserts on the catalogue, not on source text.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { en } from './en';
import { KEY_COMMANDS } from '../lib/commands/keyboard-commands';
import { shownOnTheWall } from '../lib/commands/wall-key-commands';

/**
 * #231: the prefix list in `locales/ro.test.ts` misses a screen whose keys sit under another
 * prefix (`revision.`, `review.`, `printPreview.`), and `settings.privacy.toast`
 * never named the toast's own rows either, so the sheet toolbar read English
 * under Română with this test green. The second way in is a SCREEN, not a
 * prefix: every English key that a source file of the IfcSheet face names as a
 * string literal must have a Romanian entry. The files are the Wall, the shell
 * around it, the sheet renderers, the first-launch privacy notice, the sheet content listed under #258 and the tour's own step card. The card was missed at first: it sits in `components/tours`, outside the Wall's folders, and its skip label is a key of the shared tours catalogue (the host, which asks for a model first, is gated with it).
 */
const FACE_SOURCES = [
  'components/viewer/wall', 'components/viewer/ifcsheet', 'components/viewer/sheets', 'hooks/usePrivacyDisclosure.ts', 'lib/tours/tours/ifcsheet.ts', 'components/tours/TourStepCard.tsx', 'components/tours/TourHost.tsx',
  // #258: what a sheet prints. The site plan and the urban indicators (the site balance, Ac, Ad, Au, POT and CUT), the legend, the schedules the joinery folder draws (the finishes and type-quantity tables, the drawing register) and the civil profile's band labels.
  'components/viewer/siteplan', 'components/viewer/urban', 'siteplan', 'urban', 'components/viewer/legend/LegendGraphic.tsx', 'legend', 'components/viewer/joinery/ScheduleGraphic.tsx', 'issue', 'components/viewer/joinery/RegisterView.tsx', 'components/viewer/civil/CivilDrawingGraphic.tsx', 'civil/civil-drawings.ts',
  // #314: the drawing command line (its prompts, results and errors), the commands behind it, and the Info dialog the Keyboard button opens. Command names (LINE, TAGALL) are typed aliases and stay as they are.
  'drafting', 'components/viewer/drafting/CommandLine.tsx', 'components/viewer/KeyboardShortcutsDialog.tsx', 'components/viewer/KeyboardShortcutsDialogTabs.tsx', 'components/viewer/KeyboardShortcutsWhatsNewTab.tsx', 'components/viewer/ShortcutsTab.tsx', 'components/tours/LearnTab.tsx', 'project/model-command-bridge.ts', 'project/useLinkedElementSync.ts',
];
const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));
function faceFiles(rel: string): string[] {
  const path = join(SRC_ROOT, rel);
  if (/\.tsx?$/.test(path)) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? faceFiles(join(rel, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(path, e.name)] : []));
}

/**
 * The English keys one source file names: each string literal that is a key, and,
 * for a key built at render (`t(`tagFields.kind.${k}`)`), every key under the
 * template's head. Read off the syntax tree, so a comment or a longer sentence
 * that merely contains a key's text names nothing.
 */
function keysNamedBy(file: string): Set<string> {
  const named = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && Object.hasOwn(en, node.text)) named.add(node.text);
    if (ts.isTemplateExpression(node)) {
      const head = node.head.text;
      if (head.endsWith('.')) for (const key of Object.keys(en)) if (key.startsWith(head)) named.add(key);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  return named;
}

/** `key (file)` for every English key a face file names that `cat` lacks. */
export function untranslatedFaceKeys(cat: Readonly<object>): string[] {
  const found = new Map<string, Set<string>>();
  for (const rel of FACE_SOURCES) {
    for (const file of faceFiles(rel)) {
      const named = keysNamedBy(file);
      for (const key of named) {
        if (!Object.hasOwn(en, key) || Object.hasOwn(cat, key)) continue;
        found.set(key, (found.get(key) ?? new Set()).add(file.slice(SRC_ROOT.length)));
      }
    }
  }
  // #314: the Shortcuts tab builds its rows from a table, so no source file names their labels; the rows the Wall lists are read off the table itself.
  for (const row of shownOnTheWall(KEY_COMMANDS)) {
    if (Object.hasOwn(cat, row.labelKey)) continue;
    found.set(row.labelKey, (found.get(row.labelKey) ?? new Set()).add('lib/commands/keyboard-commands.ts'));
  }
  return [...found].map(([key, files]) => `${key} (${[...files].join(', ')})`).sort();
}

