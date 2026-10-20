/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The tag-field sources: first non-empty wins, defaults, kinds, and the files that keep them. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wall } from '@/labels/label-fixture.js';
import { readFieldValue, resolveTemplate, type LabelElement } from '@/labels/label-resolve.js';
import { parseTemplate } from '@/labels/label-template.js';
import { parseCatalogue, serializeCatalogue, emptyCatalogue } from '@/catalogue/catalogue-file.js';
import { mergeCatalogues } from '@/catalogue/catalogue-merge.js';
import { defaultSources, isCustom, sourcesOf, tagKindOf, withSources, type TagFieldConfig, type TagSource } from './tag-fields.js';
import { readTagFields } from './tag-fields-file.js';
import { LEGACY_ROOM_TEMPLATE, ROOM_TEMPLATE, ROOM_TYPE_ID, TAGALL_TYPES, upgradeTagAllTypes } from '@/tagall/types.js';
import { moved } from './tag-fields-actions.js';
import { parseSourcePath, previewSources, sourcePath } from './tag-preview.js';
import { importCatalogueText } from '@/catalogue/catalogue-store.js';
import { parseProjectFile, serializeProject } from '@/project/project-file.js';
import { projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';

const door = (over: Partial<LabelElement> = {}): LabelElement => wall({
  className: () => 'IfcDoor',
  attribute: (n) => ({ Name: 'Door 1', Tag: 'D-7', Mark: 'D-7', LongName: '' } as Record<string, string>)[n] ?? '',
  propertySets: () => [{ name: 'Pset_DoorCommon', properties: [{ name: 'Reference', value: 'REF-1' }, { name: 'Blank', value: '' }] }, { name: 'Office', properties: [{ name: 'Nr', value: 'ș ț ă î â' }] }],
  quantitySets: () => [{ name: 'Qto_DoorBaseQuantities', quantities: [{ name: 'Width', value: 900, length: true }] }],
  typePropertySets: () => [{ name: 'Pset_DoorCommon', properties: [{ name: 'FireRating', value: 'EI 30' }] }],
  ...over,
});
const pset = (p: string, n: string): TagSource => ({ kind: 'pset', pset: p, property: n });
const mark = (config: TagFieldConfig | undefined, el: LabelElement) => readFieldValue({ kind: 'attribute', name: 'Mark' }, { ...el, tagFields: config }).value;

describe('tag field sources', () => {
  it('read the defaults when nothing is configured: the Tag as a mark, the name, a room long name first', () => {
    assert.equal(mark(undefined, door()), 'D-7');
    assert.deepEqual(defaultSources('room', 'name'), [{ kind: 'attribute', name: 'LongName' }, { kind: 'attribute', name: 'Name' }]);
    const room = wall({ className: () => 'IfcSpace', attribute: (n) => ({ Name: '4', LongName: 'Schlafzimmer' } as Record<string, string>)[n] ?? '' });
    assert.equal(readFieldValue({ kind: 'attribute', name: 'TagName' }, room).value, 'Schlafzimmer');
    assert.equal(readFieldValue({ kind: 'attribute', name: 'TagName' }, door()).value, 'Door 1');
  });

  it('take the first source that has a value, not the last', () => {
    const config: TagFieldConfig = { door: { mark: [pset('Pset_DoorCommon', 'Blank'), pset('Pset_DoorCommon', 'Reference'), pset('Office', 'Nr')] } };
    assert.equal(mark(config, door()), 'REF-1', 'the empty source is skipped, the second is taken, the third is not');
    assert.equal(mark({ door: { mark: [pset('Office', 'Nr'), pset('Pset_DoorCommon', 'Reference')] } }, door()), 'ș ț ă î â');
  });

  it('read a quantity, a type property and an attribute through the label reader', () => {
    assert.equal(mark({ door: { mark: [{ kind: 'quantity', qto: 'Qto_DoorBaseQuantities', name: 'Width' }] } }, door()), 900);
    assert.equal(mark({ door: { mark: [{ kind: 'type-pset', pset: 'Pset_DoorCommon', property: 'FireRating' }] } }, door()), 'EI 30');
    assert.equal(mark({ door: { mark: [{ kind: 'attribute', name: 'Name' }] } }, door()), 'Door 1');
    assert.equal(mark({ door: { mark: [pset('Nope', 'Nope')] } }, door()), undefined, 'a source with no value reads nothing');
  });

  it('apply to the kind of the element only', () => {
    const config: TagFieldConfig = { door: { mark: [pset('Pset_DoorCommon', 'Reference')] } };
    assert.equal(mark(config, door()), 'REF-1');
    assert.equal(mark(config, door({ className: () => 'IfcWindow' })), 'D-7');
    assert.deepEqual(['IfcDoorStandardCase', 'IfcWindow', 'IfcSpace', 'IfcWallStandardCase', 'IfcColumn'].map(tagKindOf), ['door', 'window', 'room', 'wall', 'other']);
  });

  it('show in a label as the Mark and TagName placeholders, with the template fallback after them', () => {
    const config: TagFieldConfig = { door: { mark: [pset('Pset_DoorCommon', 'Blank')] } };
    const el = { ...door(), tagFields: config };
    assert.equal(resolveTemplate(parseTemplate('{Mark ?? Name}'), el), 'Door 1');
    assert.equal(resolveTemplate(parseTemplate('{Mark ?? Name}'), { ...door(), tagFields: { door: { mark: [pset('Office', 'Nr')] } } }), 'ș ț ă î â');
  });

  it('keep what was set, the default list too, remove on null, and an empty list is an answer', () => {
    const set = withSources(undefined, 'door', 'mark', [pset('A', 'b')]);
    assert.ok(isCustom(set, 'door', 'mark'));
    assert.equal(withSources(set, 'door', 'mark', null), undefined, 'back to the default removes the entry and the empty configuration');
    assert.ok(isCustom(withSources(undefined, 'room', 'name', defaultSources('room', 'name')), 'room', 'name'), 'the default list set by hand opts the TAG tool in');
    assert.deepEqual(sourcesOf(withSources(undefined, 'door', 'mark', []), 'door', 'mark'), []);
    assert.equal(mark(withSources(undefined, 'door', 'mark', []), door()), undefined);
  });

  it('preview what each source reads and mark the one taken', () => {
    const rows = previewSources(door(), [pset('Pset_DoorCommon', 'Blank'), pset('Pset_DoorCommon', 'Reference'), pset('Office', 'Nr')]);
    assert.deepEqual(rows.map((r) => [r.text, r.used]), [['', false], ['REF-1', true], ['ș ț ă î â', false]]);
    assert.deepEqual(previewSources(door(), [{ kind: 'attribute', name: 'Mark' }]).map((r) => r.text), ['D-7'], 'the Mark attribute source is the stored one, not the tag field');
  });

  it('move and parse', () => {
    assert.deepEqual(moved([1, 2, 3], 0, 1), [2, 1, 3]);
    assert.deepEqual(moved([1, 2, 3], 0, -1), [1, 2, 3]);
    assert.deepEqual(parseSourcePath('pset', 'Pset_DoorCommon.Reference'), pset('Pset_DoorCommon', 'Reference'));
    assert.equal(parseSourcePath('pset', 'Reference'), null);
    assert.deepEqual(parseSourcePath('quantity', 'Qto.Width'), { kind: 'quantity', qto: 'Qto', name: 'Width' });
  });
});

describe('tag fields in the files', () => {
  const config: TagFieldConfig = { door: { mark: [pset('Pset_DoorCommon', 'Reference'), { kind: 'attribute', name: 'Mark' }] }, room: { name: [{ kind: 'quantity', qto: 'Q', name: 'N' }, { kind: 'type-pset', pset: 'P', property: 'p' }] } };

  it('round-trip through the library file', () => {
    const back = parseCatalogue(serializeCatalogue({ ...emptyCatalogue(), tagFields: config }, 'Office'));
    assert.deepEqual(back.catalogue.tagFields, config);
    assert.equal(parseCatalogue(serializeCatalogue(emptyCatalogue(), 'Office')).catalogue.tagFields, undefined);
  });

  it('a library file carrying them puts them in the project on import', () => {
    resetProject();
    assert.equal(useProjectStore.getState().tagFields, undefined);
    const { report } = importCatalogueText(serializeCatalogue({ ...emptyCatalogue(), tagFields: config }, 'Office'), 'theirs');
    assert.deepEqual(useProjectStore.getState().tagFields, config);
    assert.equal(report.tagFields.added, 2);
    assert.equal(useProjectStore.getState().dirty, true);
  });

  it('fail with their path when malformed, and drop kinds and fields they do not know', () => {
    assert.throws(() => readTagFields({ door: { mark: [{ kind: 'pset', pset: 'A' }] } }, '/tagFields'), /tagFields\.door\.mark\[0\]/);
    assert.throws(() => readTagFields({ door: { mark: [{ kind: 'attribute', name: 'TagName' }] } }, '/tagFields'), /tagFields\.door\.mark\[0\]\.name/);
    assert.throws(() => readTagFields({ door: { mark: 'Tag' } }, '/tagFields'), /tagFields\.door\.mark/);
    assert.deepEqual(readTagFields({ lift: { mark: [] }, door: { colour: [], mark: [pset('A', 'b')] } }, '/tagFields'), { door: { mark: [pset('A', 'b')] } });
    assert.equal(readTagFields({ lift: {} }, '/tagFields'), undefined);
  });

  it('merge by field: added when the project has none, kept when equal, the policy decides when different', () => {
    const mine: TagFieldConfig = { door: { mark: [pset('A', 'b')] } };
    const theirs: TagFieldConfig = { door: { mark: [pset('C', 'd')], name: [pset('E', 'f')] }, window: { mark: [pset('G', 'h')] } };
    const run = (policy: 'mine' | 'theirs' | 'both') => mergeCatalogues({ ...emptyCatalogue(), tagFields: mine }, { ...emptyCatalogue(), tagFields: theirs }, policy);
    assert.deepEqual(run('mine').catalogue.tagFields, { door: { mark: [pset('A', 'b')], name: [pset('E', 'f')] }, window: { mark: [pset('G', 'h')] } });
    assert.deepEqual(run('mine').report.tagFields, { added: 2, kept: 1, replaced: 0, renamed: 0 });
    assert.deepEqual(run('theirs').catalogue.tagFields?.door?.mark, [pset('C', 'd')]);
    assert.equal(run('theirs').report.tagFields.replaced, 1);
    assert.deepEqual(run('both').catalogue.tagFields?.door?.mark, [pset('A', 'b')]);
  });
});

describe('the room label of a project made before the tag name', () => {
  const old = TAGALL_TYPES.map((t) => (t.id === ROOM_TYPE_ID ? { ...t, label: { ...t.label!, template: LEGACY_ROOM_TEMPLATE } } : t));
  it('takes the template that reads the tag name, unless the office changed it', () => {
    assert.equal(upgradeTagAllTypes(old).find((t) => t.id === ROOM_TYPE_ID)?.label?.template, ROOM_TEMPLATE);
    const own = old.map((t) => (t.id === ROOM_TYPE_ID ? { ...t, label: { ...t.label!, template: '{Name} only' } } : t));
    assert.equal(upgradeTagAllTypes(own), own);
    const current = [...TAGALL_TYPES];
    assert.equal(upgradeTagAllTypes(current), current);
  });
});

describe('review round of #113', () => {
  it('drops a source of a kind this version does not know, with a note, and keeps the rest; a project file with one opens', () => {
    const notes: unknown[][] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => { notes.push(a); };
    try {
      const raw = { door: { mark: [{ kind: 'classification', system: 'Uniclass' }, pset('A', 'b')] }, room: { name: [{ kind: 'formula', expr: 'x' }] } };
      // A field whose every source is dropped reads its default, not nothing; a list empty in the file stays empty.
      assert.deepEqual(readTagFields(raw, '/tagFields'), { door: { mark: [pset('A', 'b')] } });
      assert.deepEqual(readTagFields({ room: { name: [] } }, '/tagFields'), { room: { name: [] } });
      assert.equal(notes.length, 2, 'one note per dropped source');
      assert.match(String(notes[0][0]), /tagFields\.door\.mark\[0\].*classification/);
      // A known kind that is malformed still fails: only the unknown kind is forward-compatible.
      assert.throws(() => readTagFields({ door: { mark: [{ kind: 'pset', pset: 'A' }] } }, '/tagFields'), /tagFields\.door\.mark\[0\]/);
      const file = JSON.parse(serializeProject(projectDocument()));
      file.tagFields = raw;
      const doc = parseProjectFile(JSON.stringify(file));
      assert.deepEqual(doc.tagFields?.door?.mark, [pset('A', 'b')]);
    } finally {
      console.warn = warn;
    }
  });

  it('upgrades the room label of an older library file on import, as on project load', () => {
    resetProject();
    const old = TAGALL_TYPES.map((t) => (t.id === ROOM_TYPE_ID ? { ...t, label: { ...t.label!, template: LEGACY_ROOM_TEMPLATE } } : t));
    const text = serializeCatalogue({ ...emptyCatalogue(), annotationTypes: old }, 'Office 2025');
    assert.equal(parseCatalogue(text).catalogue.annotationTypes.find((t) => t.id === ROOM_TYPE_ID)?.label?.template, ROOM_TEMPLATE);
    // Into a project that already has the current label: no clash, the label stays the current one.
    useProjectStore.setState({ annotationTypes: TAGALL_TYPES.map((t) => structuredClone(t)) });
    const { report } = importCatalogueText(text, 'theirs');
    assert.equal(useProjectStore.getState().annotationTypes?.find((t) => t.id === ROOM_TYPE_ID)?.label?.template, ROOM_TEMPLATE);
    assert.equal(report.annotationTypes.replaced, 0);
  });

  it('takes a property set name with a dot: escaped, or as the set the element carries', () => {
    assert.deepEqual(parseSourcePath('pset', 'Office\\.v2.Nr'), pset('Office.v2', 'Nr'));
    assert.deepEqual(parseSourcePath('type-pset', 'A\\\\B.c'), { kind: 'type-pset', pset: 'A\\B', property: 'c' });
    assert.equal(sourcePath(pset('Office.v2', 'Nr')), 'Office\\.v2.Nr');
    assert.deepEqual(parseSourcePath('pset', sourcePath(pset('a.b\\c', 'd.e'))), pset('a.b\\c', 'd.e'), 'the path the suggestions list writes reads back');
    // Typed plainly, it is the set the element carries when one matches.
    const known = [pset('Office.v2', 'Nr')];
    assert.deepEqual(parseSourcePath('pset', 'Office.v2.Nr', known), pset('Office.v2', 'Nr'));
    assert.deepEqual(parseSourcePath('pset', 'Pset_DoorCommon.Reference', known), pset('Pset_DoorCommon', 'Reference'));
  });
});
