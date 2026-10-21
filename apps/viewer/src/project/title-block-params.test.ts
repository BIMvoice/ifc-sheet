/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_PROJECT, loadProjectDocument, resetProject, useProjectStore } from './project-store';
import { customiseTitleBlock, setTemplateField } from './title-block-template-actions';
import { addProjectSheet } from './project-store';
import { addTitleBlockParam, clearSheetParam, deleteTitleBlockParam, renameTitleBlockParam, setSheetParam, setTitleBlockParamValue } from './title-block-param-actions';
import { checkParamName, paramLookup, resolveParamText } from './title-block-params';
import { clearDraftHistory, commitDrafts, newDraft, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { PARAMETRIC_TEXT } from './parametric-text';

/**
 * #143: the title block's user-defined parameters. A parameter is a name and
 * a project-wide value, with an optional per-sheet value; `{Name}` in text
 * reads it, and a name nobody defined shows as `{Name?}` rather than blank.
 */

const lookup = (known: Record<string, string>) => (name: string): string | undefined => known[name];

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(() => { resetProject(); clearDraftHistory(); });

describe('resolveParamText (#143)', () => {
  it('replaces a parameter, alone or inside other text', () => {
    assert.equal(resolveParamText('{Phase}', lookup({ Phase: 'DTAC' })), 'DTAC');
    assert.equal(resolveParamText('Phase: {Phase} / {No}', lookup({ Phase: 'DTAC', No: '7' })), 'Phase: DTAC / 7');
  });

  it('shows a missing parameter visibly, never blank', () => {
    assert.equal(resolveParamText('{Unknown}', lookup({})), '{Unknown?}');
    assert.equal(resolveParamText('a {Unknown} b', lookup({})), 'a {Unknown?} b');
  });

  it('a defined parameter with an empty value is empty, not missing', () => {
    assert.equal(resolveParamText('[{Phase}]', lookup({ Phase: '' })), '[]');
  });

  it('a known name next to an unknown one: only the unknown one is marked, nothing else leaks into the text', () => {
    const out = resolveParamText('Issued for {Phase}, sheet {SheetNumber}, {Nope}', lookup({ Phase: 'Permit set', SheetNumber: 'A-101' }));
    assert.equal(out, 'Issued for Permit set, sheet A-101, {Nope?}');
    assert.ok(!/undefined|null/.test(out));
  });

  it('an unknown name and an empty value never print undefined or null', () => {
    assert.equal(resolveParamText('{Nope}', lookup({})), '{Nope?}');
    assert.equal(resolveParamText('{A}|{Nope}|{B}', lookup({ A: '', B: 'b' })), '|{Nope?}|b');
  });

  it('leaves braces that do not name a parameter alone', () => {
    assert.equal(resolveParamText('{ spaced } {1st} {}', lookup({})), '{ spaced } {1st} {}');
  });

  it('does not read a value as a template: no second pass', () => {
    assert.equal(resolveParamText('{A}', lookup({ A: '{B}', B: 'x' })), '{B}');
  });
});

describe('parameter names (#143)', () => {
  const existing = [{ name: 'Phase', value: 'x' }];
  it('accepts a letter-led word of letters, digits and underscores', () => {
    assert.equal(checkParamName('ProjectNumber', existing), null);
    assert.equal(checkParamName('Phase_2', existing), null);
  });
  it('refuses empty, malformed, built-in and duplicate names, and tells which', () => {
    assert.equal(checkParamName('', existing), 'empty');
    assert.equal(checkParamName('  ', existing), 'empty');
    assert.equal(checkParamName('2nd', existing), 'invalid');
    assert.equal(checkParamName('has space', existing), 'invalid');
    assert.equal(checkParamName('SheetNumber', existing), 'builtin');
    assert.equal(checkParamName('sheetnumber', existing), 'builtin');
    assert.equal(checkParamName('Phase', existing), 'duplicate');
    assert.equal(checkParamName('phase', existing), 'duplicate');
  });
  it('lets a parameter keep its own name when it is renamed to the same', () => {
    assert.equal(checkParamName('Phase', existing, 'Phase'), null);
  });
});

describe('parameter actions (#143)', () => {
  it('adds a parameter, and refuses a name it would not accept', () => {
    assert.equal(addTitleBlockParam('Phase', 'DTAC'), null);
    assert.deepEqual(useProjectStore.getState().titleBlockParams, [{ name: 'Phase', value: 'DTAC' }]);
    assert.equal(addTitleBlockParam('Phase', 'x'), 'duplicate');
    assert.equal(addTitleBlockParam('Date', 'x'), 'builtin');
    assert.equal(useProjectStore.getState().titleBlockParams?.length, 1);
    assert.equal(useProjectStore.getState().dirty, true);
  });

  it('changes the project value, and a sheet value is its own until cleared', () => {
    addTitleBlockParam('Phase', 'DTAC');
    const id = addProjectSheet('Plans', 'plans');
    setSheetParam(id, 'Phase', 'PAC');
    setTitleBlockParamValue('Phase', 'PTh');
    assert.equal(useProjectStore.getState().titleBlockParams?.[0]?.value, 'PTh');
    assert.deepEqual(useProjectStore.getState().sheets.find((s) => s.id === id)?.titleBlockParams, { Phase: 'PAC' });
    clearSheetParam(id, 'Phase');
    assert.equal(useProjectStore.getState().sheets.find((s) => s.id === id)?.titleBlockParams, undefined);
  });

  it('renaming carries the sheet values with it and rewrites {Old} in the layout and sheet text', () => {
    addTitleBlockParam('Phase', 'DTAC');
    const id = addProjectSheet('Plans', 'plans');
    setSheetParam(id, 'Phase', 'PAC');
    assert.equal(renameTitleBlockParam('Phase', 'Stage'), null);
    const s = useProjectStore.getState();
    assert.deepEqual(s.titleBlockParams, [{ name: 'Stage', value: 'DTAC' }]);
    assert.deepEqual(s.sheets.find((x) => x.id === id)?.titleBlockParams, { Stage: 'PAC' });
  });

  it('deleting drops the sheet values too', () => {
    addTitleBlockParam('Phase', 'DTAC');
    const id = addProjectSheet('Plans', 'plans');
    setSheetParam(id, 'Phase', 'PAC');
    deleteTitleBlockParam('Phase');
    const s = useProjectStore.getState();
    assert.deepEqual(s.titleBlockParams, []);
    assert.equal(s.sheets.find((x) => x.id === id)?.titleBlockParams, undefined);
  });

  it('refuses a rename onto another name in use, leaving everything as it was', () => {
    addTitleBlockParam('A', '1');
    addTitleBlockParam('B', '2');
    assert.equal(renameTitleBlockParam('A', 'B'), 'duplicate');
    assert.deepEqual(useProjectStore.getState().titleBlockParams?.map((p) => p.name), ['A', 'B']);
  });

  it('renames the text in the drafts\' undo history: an older undo step does not bring {Old} back, and the rename itself is a step', () => {
    addTitleBlockParam('Phase', 'DTAC');
    const sheet = addProjectSheet('Plans', 'plans');
    const text = newDraft(sheet, '0', { type: 'text', p: { x: 0, y: 0 }, text: 'P {Phase}', height: 3.5, rotation: 0 }, { [PARAMETRIC_TEXT]: true });
    const line = newDraft(sheet, '0', { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
    const words = () => useProjectStore.getState().drafts.map((d) => (d.shape.type === 'text' ? d.shape.text : d.shape.type));
    commitDrafts([text]);
    commitDrafts([text, line]);
    assert.equal(renameTitleBlockParam('Phase', 'Stage'), null);
    assert.deepEqual(words(), ['P {Stage}', 'line']);

    // The newest step is the rename: undoing it takes back the rewrite and leaves the line where it was.
    assert.equal(undoDrafts(), true);
    assert.deepEqual(words(), ['P {Phase}', 'line']);
    assert.equal(redoDrafts(), true);
    assert.deepEqual(words(), ['P {Stage}', 'line']);

    // Redone, the line can still be undone and redone without losing the new name.
    assert.equal(undoDrafts(), true);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(words(), ['P {Phase}']);
    assert.equal(redoDrafts(), true);
    assert.equal(redoDrafts(), true);
    assert.deepEqual(words(), ['P {Stage}', 'line']);
  });

  /** What every text would print: no `{X?}` may appear for a parameter that exists. */
  const printed = (): string[] => {
    const known = Object.fromEntries((useProjectStore.getState().titleBlockParams ?? []).map((p) => [p.name, p.value]));
    return useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'text' ? [resolveParamText(d.shape.text, lookup(known))] : []));
  };
  const names = () => useProjectStore.getState().titleBlockParams?.map((p) => p.name);
  const texts = () => useProjectStore.getState().drafts.map((d) => d.shape.type === 'text' && d.shape.text);
  const setup = () => {
    addTitleBlockParam('Phase', 'DTAC');
    const sheet = addProjectSheet('Plans', 'plans');
    const text = newDraft(sheet, '0', { type: 'text', p: { x: 0, y: 0 }, text: 'P {Phase}', height: 3.5, rotation: 0 }, { [PARAMETRIC_TEXT]: true });
    const line = newDraft(sheet, '0', { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
    commitDrafts([text]);
    return { text, line };
  };

  it('undoing a rename takes back the parameter AND the texts', () => {
    setup();
    renameTitleBlockParam('Phase', 'Stage');
    assert.deepEqual(printed(), ['P DTAC']);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(names(), ['Phase']);
    assert.deepEqual(texts(), ['P {Phase}']);
    assert.deepEqual(printed(), ['P DTAC']);
  });

  it('redoing a rename re-applies the parameter AND the texts', () => {
    setup();
    renameTitleBlockParam('Phase', 'Stage');
    undoDrafts();
    assert.deepEqual(names(), ['Phase']);
    assert.equal(redoDrafts(), true);
    assert.deepEqual(names(), ['Stage']);
    assert.deepEqual(texts(), ['P {Stage}']);
    assert.deepEqual(printed(), ['P DTAC']);
  });

  it('stays consistent at every step of rename, line and undo/redo', () => {
    const { text, line } = setup();
    commitDrafts([text, line]);
    renameTitleBlockParam('Phase', 'Stage');
    const ok = () => assert.deepEqual(printed(), ['P DTAC']);
    ok();
    undoDrafts(); ok(); assert.deepEqual(names(), ['Phase']);
    undoDrafts(); ok(); assert.equal(useProjectStore.getState().drafts.length, 1);
    redoDrafts(); ok(); assert.deepEqual(names(), ['Phase']);
    redoDrafts(); ok(); assert.deepEqual(names(), ['Stage']);
    assert.equal(useProjectStore.getState().drafts.length, 2);
  });

  it('a rename that touches no text still renames, and undo reverts it', () => {
    addTitleBlockParam('Phase', 'DTAC');
    const sheet = addProjectSheet('Plans', 'plans');
    commitDrafts([newDraft(sheet, '0', { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })]);
    renameTitleBlockParam('Phase', 'Stage');
    assert.deepEqual(names(), ['Stage']);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(names(), ['Phase']);
    assert.equal(useProjectStore.getState().drafts.length, 1);
    assert.equal(redoDrafts(), true);
    assert.deepEqual(names(), ['Stage']);
  });
  /** Every sheet value and every `{X}` in the layout names a parameter the list has, and no two parameters share a name. */
  const consistent = (): void => {
    const s = useProjectStore.getState();
    const list = names() ?? [];
    assert.equal(new Set(list.map((n) => n.toLowerCase())).size, list.length, `two parameters share a name: ${list.join(', ')}`);
    for (const sheet of s.sheets) for (const k of Object.keys(sheet.titleBlockParams ?? {})) assert.ok(list.includes(k), `a sheet value names ${k}, which the list does not have (${list.join(', ')})`);
    for (const item of s.titleBlockTemplate?.items ?? []) {
      if (item.kind !== 'text') continue;
      assert.ok(!resolveParamText(item.text, (n) => (list.includes(n) ? 'v' : undefined)).includes('?}'), `the layout prints ${item.text} unresolved`);
    }
  };

  it('undoing a rename never leaves two parameters with one name, nor redo (the old name reused since)', () => {
    addTitleBlockParam('A', '1');
    renameTitleBlockParam('A', 'B');
    assert.equal(addTitleBlockParam('A', '2'), null);
    for (let i = 0; i < 3; i += 1) { undoDrafts(); consistent(); }
    assert.deepEqual(names() ?? [], []);
    for (let i = 0; i < 3; i += 1) { redoDrafts(); consistent(); }
    assert.deepEqual(names(), ['B', 'A']);
  });

  it('undo after another project is opened leaves that project\'s parameters alone', () => {
    addTitleBlockParam('A', '1');
    renameTitleBlockParam('A', 'B');
    loadProjectDocument({ ...EMPTY_PROJECT, name: 'Other', titleBlockParams: [{ name: 'B', value: 'other' }] });
    undoDrafts();
    assert.deepEqual(useProjectStore.getState().titleBlockParams, [{ name: 'B', value: 'other' }]);
  });

  it('a sheet value set after a rename: every undo and redo keeps the sheet values on parameters that exist', () => {
    addTitleBlockParam('A', '1');
    const sheet = addProjectSheet('Plans', 'plans');
    setSheetParam(sheet, 'A', 'own');
    renameTitleBlockParam('A', 'B');
    setSheetParam(sheet, 'B', 'own2');
    const own = () => useProjectStore.getState().sheets.find((x) => x.id === sheet)?.titleBlockParams;
    undoDrafts(); consistent(); assert.deepEqual(own(), { B: 'own' });
    undoDrafts(); consistent(); assert.deepEqual(own(), { A: 'own' });
    redoDrafts(); redoDrafts(); consistent(); assert.deepEqual(own(), { B: 'own2' });
  });

  it('deleting a parameter in use is one undo step that brings back its sheet values', () => {
    addTitleBlockParam('A', '1');
    const sheet = addProjectSheet('Plans', 'plans');
    setSheetParam(sheet, 'A', 'own');
    deleteTitleBlockParam('A');
    assert.deepEqual(names(), []);
    assert.equal(undoDrafts(), true);
    consistent();
    assert.deepEqual(names(), ['A']);
    assert.deepEqual(useProjectStore.getState().sheets.find((x) => x.id === sheet)?.titleBlockParams, { A: 'own' });
  });

  it('a layout edit after a rename: undoing both brings the layout\'s {Name} back with the name', () => {
    addTitleBlockParam('A', '1');
    customiseTitleBlock({ items: [{ id: 'tx', kind: 'text', x: 0, y: 0, size: 3, text: 'Phase {A}' }] });
    renameTitleBlockParam('A', 'B');
    assert.equal(setTemplateField('tx', 'x', 5), true);
    const words = () => useProjectStore.getState().titleBlockTemplate?.items.map((i) => (i.kind === 'text' ? i.text : ''));
    undoDrafts(); consistent(); assert.deepEqual(words(), ['Phase {B}']);
    undoDrafts(); consistent(); assert.deepEqual(words(), ['Phase {A}']);
    assert.deepEqual(names(), ['A']);
  });
});

describe('paramLookup (#143)', () => {
  it('does not read a sheet value for a parameter the project no longer has: it prints as missing', () => {
    const read = paramLookup({ titleBlockParams: { Gone: 'stale', Phase: 'own' } }, [{ name: 'Phase', value: 'DTAC' }], {});
    assert.equal(read('Phase'), 'own');
    assert.equal(resolveParamText('{Gone}', read), '{Gone?}');
  });
});
