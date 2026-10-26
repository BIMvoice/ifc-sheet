/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkCatalogue } from '../catalogue-problems';
import { untranslatedFaceKeys } from '../face-keys';
import { en, type TranslationKey } from '../en';
import type { TranslationValue } from '../types';
import ro from './ro';

/**
 * Romanian (#53). The key list comes from the English catalogue, not from a
 * hand-kept list: a new English key under one of these prefixes fails here
 * until it has a Romanian entry. `wall.` is every text on the Wall, its
 * drawer, sheet cards, title block, scales and tool rail; the rest are the
 * catalogues the Wall opens (sheet settings, what is missing, issue the set,
 * what changed, libraries, the takeoff and door and window schedule as they
 * print on a sheet, the draft set report, the title block's parameters and layout), then what the face reaches
 * outside the Wall (`IfcSheetShell` covers the engine's interface, and keeps these): the command palette, the Settings
 * dialog, the feedback dialog and a drawing's annotation bar.
 */
const IN_SCOPE = ['wall.', 'sheets.', 'check.', 'issue.', 'whatchanged.', 'library.', 'takeoff.', 'schedule.row.', 'schedule.export.', 'joinery.op.', 'draftSet.', 'names.', 'tbparams.', 'tblayout.', 'settings.privacy.toast', 'viewerShell.toast.dismiss',
  // The palette (Ctrl/Cmd+K) the face keeps, the Settings dialog its privacy notice opens, and the feedback dialog of its top bar.
  'commandPalette.', 'settings.', 'feedback.'];
/**
 * Single keys, matched exactly because their prefix also holds keys the face does not reach: the annotation bar of
 * a drawing, one toast and one label, and the palette rows whose text lives in another catalogue's prefix (panel
 * titles, the project, version and export commands).
 */
const IN_SCOPE_KEYS = new Set<string>([
  'standards.open', 'standards.el.style', 'standards.el.height', 'standards.el.editText', 'standards.el.reset', 'standards.text.bold', 'standards.text.italic',
  'standards.dim.placement.above', 'standards.dim.placement.centered', 'standards.dim.placement.below',
  'standards.dim.arrow', 'standards.dim.arrow.tick', 'standards.dim.arrow.arrow', 'standards.dim.arrow.dot', 'standards.dim.arrow.none',
  'drafting.snap', 'drafting.sectionDepth', 'viewerShell.file.ifcxOverlayRequiresIfcx',
  'lists.panel.title', 'workspacePanels.bottom.document', 'section2d.heading', 'properties.panel.title', 'changesPanel.title', 'measure.panel.title', 'viewportLighting.sunSkyPanel.header.title', 'commands.visibility.showAll',
  'projectPackage.open', 'projectPackage.save', 'projectPackage.saveAs', 'projectPackage.link', 'projectVersions.save', 'projectVersions.update', 'projectVersions.history',
  'exportCommands.ifc.menuLabel', 'exportCommands.anonymized.menuLabel', 'exportCommands.modifiedIfc.menuLabel', 'exportCommands.glb.menuLabel', 'exportCommands.kmz.menuLabel', 'exportCommands.ion.menuLabel', 'exportCommands.usd.menuLabel', 'exportCommands.energy.menuLabel', 'exportCommands.json.menuLabel', 'exportCommands.screenshot.menuLabel', 'exportCommands.pdf.menuLabel',
]);
const keys = (Object.keys(en) as TranslationKey[]).filter((k) => IN_SCOPE_KEYS.has(k) || IN_SCOPE.some((p) => k.startsWith(p)));
const catalogue = ro as Readonly<Record<string, TranslationValue>>;

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const forms = (v: TranslationValue): Record<string, string> => (typeof v === 'string' ? { other: v } : { ...v });
const names = (text: string): Set<string> => new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]));
const union = (v: TranslationValue): Set<string> => new Set(Object.values(forms(v)).flatMap((f) => [...names(f)]));

/** Keys whose Romanian drops or invents a placeholder; Romanian `one` may say "un"/"o" instead of the count. */
function placeholderProblems(cat: Readonly<Record<string, TranslationValue>>): string[] {
  const problems: string[] = [];
  for (const key of keys) {
    const value = cat[key];
    if (value === undefined) continue;
    const expected = union(en[key]);
    for (const [form, text] of Object.entries(forms(value))) {
      const actual = names(text);
      for (const n of actual) if (!expected.has(n)) problems.push(`${key}.${form}: unknown {${n}}`);
      if (form !== 'one') for (const n of expected) if (!actual.has(n)) problems.push(`${key}.${form}: missing {${n}}`);
    }
  }
  return problems;
}

/** Every string of the catalogue that carries a cedilla ş ţ (U+015F, U+0163 and capitals) instead of the comma-below ș ț. */
function cedillaProblems(cat: Readonly<Record<string, TranslationValue>>): string[] {
  return Object.entries(cat).flatMap(([key, value]) =>
    Object.entries(forms(value)).filter(([, text]) => /[ŞşŢţ]/.test(text)).map(([form]) => `${key}.${form}`));
}

describe('Romanian catalogue (#53)', () => {
  it('has an entry for every in-scope English key, and none for a key that does not exist', () => {
    assert.ok(keys.length > 300, `the scope found ${keys.length} English keys`);
    assert.deepEqual(keys.filter((k) => !Object.hasOwn(catalogue, k)), []);
    assert.deepEqual(Object.keys(catalogue).filter((k) => !Object.hasOwn(en, k)), []);
  });

  it('has an entry for every English key a source file of the IfcSheet face names (#231)', () => {
    const missing = untranslatedFaceKeys(catalogue);
    if (missing.length > 0) assert.fail(`${missing.length} English-only key(s):\n${missing.join('\n')}`);
  });

  it('the face check catches a key that is only English', () => {
    const { 'revision.title': _dropped, ...without } = catalogue;
    assert.deepEqual(untranslatedFaceKeys(catalogue), []);
    assert.deepEqual(untranslatedFaceKeys(without), ['revision.title (components/viewer/wall/RevisionsCard.tsx, components/viewer/wall/SteppedSheet.tsx)']);
  });

  // #258: the site balance and the urban indicators printed English under Română because their folders were not in the face list.
  it('the face check reaches the site plan, the urban indicators and the schedules a sheet prints (#258)', () => {
    const { 'site.balance.title': _a, 'urban.ac': _b, 'finishes.room': _c, ...without } = catalogue;
    assert.deepEqual(untranslatedFaceKeys(without), [
      'finishes.room (components/viewer/joinery/ScheduleGraphic.tsx)',
      'site.balance.title (components/viewer/siteplan/SiteBalance.tsx)',
      'urban.ac (components/viewer/urban/useUrban.ts)',
    ]);
  });

  // #294: `issue/` was not in the face list, and the English it printed was string literals, which a key check cannot see; the words are keys now and the folder is checked.
  it('the face check reaches the issue folder (#294)', () => {
    const { 'issue.file.drawingList': _a, 'issue.list.landscape': _b, ...without } = catalogue;
    assert.deepEqual(untranslatedFaceKeys(without), [
      'issue.file.drawingList (issue/run.ts)',
      'issue.list.landscape (issue/run.ts)',
    ]);
  });

  // #314: the command line and the Info dialog read English under Română because `drafting/` and the dialog were not in the face list, with this suite green.
  it('the face check reaches the command line, the commands behind it and the Info dialog (#314)', () => {
    const { 'drafting.prompt.firstPoint': _a, 'drafting.msg.tagAllDone': _b, 'keyboardShortcuts.header.title': _c, 'drafting.commandLine': _d, 'commands.wall.nextSheet': _e, ...without } = catalogue;
    assert.deepEqual(untranslatedFaceKeys(without).sort(), [
      'drafting.commandLine (components/viewer/drafting/CommandLine.tsx)',
      'drafting.msg.tagAllDone (drafting/commands/tagall.ts)',
      'drafting.prompt.firstPoint (drafting/commands/draw.ts)',
      'keyboardShortcuts.header.title (components/viewer/KeyboardShortcutsDialog.tsx)',
      'commands.wall.nextSheet (lib/commands/keyboard-commands.ts)',
    ].sort());
  });

  it('gives every plural message of the catalogue the forms Romanian counts with (#314)', () => {
    const lacking = Object.entries(catalogue).filter(([, v]) => typeof v !== 'string' && (v.one === undefined || v.few === undefined)).map(([k]) => k);
    assert.deepEqual(lacking, []);
  });

  it('keeps the typed names of the commands (#314)', () => {
    const names = Object.keys(catalogue).filter((k) => k.startsWith('drafting.cmd.'));
    assert.ok(names.length > 30);
    assert.deepEqual(names.filter((k) => catalogue[k] !== en[k as TranslationKey]), []);
  });

  it('keeps every placeholder of the English message', () => {
    assert.deepEqual(placeholderProblems(catalogue), []);
    assert.deepEqual(checkCatalogue(catalogue).problems, []);
  });

  it('writes ș and ț with a comma below, never the cedilla forms', () => {
    assert.deepEqual(cedillaProblems(catalogue), []);
    const joined = Object.values(catalogue).flatMap((v) => Object.values(forms(v))).join('');
    assert.ok(joined.includes('ș') && joined.includes('ț'), 'the comma-below forms are in use');
  });

  it('gives a plural message the forms Romanian counts with', () => {
    for (const key of keys) {
      const value = catalogue[key];
      if (typeof value === 'string' || value === undefined) continue;
      assert.ok(value.one !== undefined && value.few !== undefined, `${key} needs one, few and other`);
    }
  });

  it('keeps product and command names as they are', () => {
    for (const key of ['check.cmd', 'issue.cmd', 'whatchanged.cmd', 'draftSet.cmd', 'wall.export.dxf'] as const) assert.equal(catalogue[key], en[key]);
  });

  // PR #124 review: the trade's terms for how a door or window opens. "Basculant"
  // is the horizontal pivot, so it may name nothing else; "canat" is the leaf
  // and always comes with the word for how it moves.
  it('names how doors and windows open with the joinery terms', () => {
    const op = (k: string) => String(catalogue[`joinery.op.${k}`]);
    assert.match(op('bottom-hung'), /^Oscilant\b/);
    assert.match(op('top-hung'), /^Proiectant\b/);
    for (const side of ['left', 'right']) {
      assert.match(op(`swing-${side}`), /^Canat batant,/);
      assert.match(op(`double-acting-${side}`), /^Canat pendulant,/);
    }
    const basculant = keys.filter((k) => k.startsWith('joinery.op.') && /basculant/i.test(String(catalogue[k])));
    assert.ok(basculant.every((k) => k === 'joinery.op.pivot-horizontal'), basculant.join(', '));
  });

  // PR #124 review: "model" is the IFC model on these screens, so a hatch
  // pattern is a "tipar", and an element whose shape changed is not "remodelat".
  it('keeps "model" for the IFC model only', () => {
    const misread = keys.filter((k) => /pattern|reshaped/i.test(Object.values(forms(en[k])).join(' ')) && /model/i.test(Object.values(forms(catalogue[k])).join(' ')));
    assert.deepEqual(misread, []);
    assert.equal(catalogue['wall.hatch.pattern'], 'Tipar');
    assert.match(String(catalogue['whatchanged.usage']), /^WHATCHANGED nu primește argumente, sau primește CLEAR ori ACCEPT; „\{arg\}”/);
  });

  it('the checks catch a cedilla and a dropped placeholder', () => {
    assert.deepEqual(cedillaProblems({ ...catalogue, 'wall.tb.done': 'Gaţa' }), ['wall.tb.done.other']);
    assert.deepEqual(cedillaProblems({ ...catalogue, 'wall.fit': 'Încadrează ş' }), ['wall.fit.other']);
    assert.deepEqual(placeholderProblems({ ...catalogue, 'wall.remove': 'Elimină' }), ['wall.remove.other: missing {name}']);
    assert.deepEqual(placeholderProblems({ ...catalogue, 'wall.remove': 'Elimină {nume}' }), ['wall.remove.other: unknown {nume}', 'wall.remove.other: missing {name}']);
  });
});
