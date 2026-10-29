/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The document field registry (#144): one entry per field, the store built from it. That every
 * `ProjectDocument` field has an entry is a compile-time check (`MissingField` in `./index.ts`); the
 * round trip and the recovery tests check what the store does with them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_FIELDS, FIELDS_IN_READ_ORDER, emptyDocument, loadedFields, readDocumentFields } from './index';
import { defineField, listField, optionalField, recordField } from './define';
import { READ_ORDER } from './read-order';
import { assembleFields } from './registered';
import { EMPTY_PROJECT, PROJECT_DOCUMENT_KEYS } from '../project-store';
import type { ProjectDocument } from '../types';

/** The file's key order when the registry was made. Saved files keep it: new fields go after these. */
const KEYS_AT_REGISTRY = [
  'name', 'models', 'views', 'sheets', 'titleBlock', 'drafts', 'draftLayers', 'hatchPatterns', 'symbolFlips', 'openingLines', 'textStyles',
  'dimStyles', 'layerGroups', 'joineryTypes', 'currentJoinery', 'schedules', 'joineryMapping', 'elementTypes', 'currentTypes',
  'structureProfiles', 'civilDrawings', 'typicalSections', 'materials', 'savedSectionCuts', 'annotationTypes', 'symbols', 'legends',
  'issues', 'modelState', 'cadLayers', 'details', 'tagFields', 'sheetTemplates', 'seriesTemplates', 'titleBlockSources',
  'titleBlockParams', 'titleBlockTemplate', 'sheetNumbering', 'phaseSource', 'graphicStandard', 'comments', 'revisions', 'siteArea',
  'urbanSettings', 'includeFarElements',
];

/** Every field's key, in file order, of the hard-coded list the registry replaced, with the fields main appended to it since (language, underlays) in the places main lists them (#144): what `serializeProject` writes, which a registry must not change. */
const KEYS_BEFORE_REGISTERED = [
  ...KEYS_AT_REGISTRY,
  'handoverPattern', 'viewTemplates', 'boqArticles', 'unitsAndNumbers', 'classificationMappings', 'installedStandard', 'byggesaksbim', 'language', 'pacIntervention',
  'norwayPermit', 'pacMode', 'underlays',
];

const base = { name: 'p', models: [], views: [], sheets: [], drafts: [], draftLayers: [] } as unknown as ProjectDocument;

describe('the document field registry', () => {
  it('assembles the same fields in the same order as the hard-coded list it replaced, then the registered ones', () => {
    // A slice, not the whole list: a field added to `./registered.ts` comes after the frozen ones and must not turn this red.
    assert.deepEqual(DOCUMENT_FIELDS.map((f) => f.key).slice(0, KEYS_BEFORE_REGISTERED.length), KEYS_BEFORE_REGISTERED);
  });

  it('puts registered fields after the frozen list, sorted by key whatever the order they are listed in', () => {
    const legacy = [listField('comments', () => []), listField('revisions', () => [])];
    const z = listField('issues', () => []);
    const a = listField('details', () => []);
    assert.deepEqual(assembleFields(legacy, [z, a]).map((f) => f.key), ['comments', 'revisions', 'details', 'issues']);
    assert.deepEqual(assembleFields(legacy, [a, z]).map((f) => f.key), ['comments', 'revisions', 'details', 'issues']);
  });

  it('refuses a registered field whose key is already listed', () => {
    assert.throws(() => assembleFields([listField('comments', () => [])], [listField('comments', () => [])]), /share the key "comments"/);
  });

  it('lists each field once', () => {
    const keys = DOCUMENT_FIELDS.map((f) => f.key);
    assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
  });

  it('keeps the key order saved files have, with new fields after the first ones', () => {
    assert.deepEqual(PROJECT_DOCUMENT_KEYS.slice(0, KEYS_AT_REGISTRY.length), KEYS_AT_REGISTRY);
  });

  it('builds a new project from the fields that have an empty value, and only those', () => {
    assert.deepEqual(EMPTY_PROJECT, emptyDocument());
    assert.deepEqual(Object.keys(EMPTY_PROJECT).sort(), DOCUMENT_FIELDS.filter((f) => f.empty).map((f) => f.key).sort());
    assert.equal('openingLines' in EMPTY_PROJECT, false, 'a field without an empty value is absent from a new project, not undefined');
    assert.equal('modelState' in EMPTY_PROJECT, true);
  });

  it('a list field is [] when new, written as [] when missing and loaded as [] when absent', () => {
    const field = listField('comments', () => []);
    assert.deepEqual([field.empty?.(), field.fallback?.(), field.load?.(undefined)], [[], [], []]);
    assert.notEqual(field.empty?.(), field.empty?.(), 'each call is a fresh list');
    const kept = [{ id: 'c' }] as unknown as ProjectDocument['comments'];
    assert.equal(field.load?.(kept), kept);
  });

  it('a record field is {} when new, written as {} when missing and loaded as {} when absent', () => {
    const field = recordField('seriesTemplates', () => ({}));
    assert.deepEqual([field.empty?.(), field.fallback?.(), field.load?.(undefined)], [{}, {}, {}]);
  });

  it('an optional field is undefined when new, has no fallback, and an absent one clears the store on load', () => {
    const field = optionalField('siteArea', () => ({}));
    assert.equal(field.empty?.(), undefined);
    assert.equal(field.fallback, undefined);
    assert.ok(field.load);
    assert.deepEqual(Object.entries(loadedFields(base)).filter(([k]) => k === 'siteArea'), [['siteArea', undefined]]);
  });

  it('loads every field that has a load step, read from the loaded document', () => {
    const loaded = loadedFields({ ...base, includeFarElements: 'yes' as never, textStyles: [] });
    assert.deepEqual(Object.keys(loaded), DOCUMENT_FIELDS.filter((f) => f.load).map((f) => f.key));
    assert.equal(loaded.includeFarElements, undefined);
    assert.equal(loaded.textStyles?.length, 1, 'a project with no text style gets the default one');
  });

  it('every field has a reader, registered with its definition', () => {
    for (const field of DOCUMENT_FIELDS) assert.equal(typeof field.read, 'function', `${field.key} has no reader`);
    // The type system refuses a definition without one: this line stops compiling if `read` becomes optional.
    // @ts-expect-error a field with no reader is not a field
    defineField({ key: 'name' });
    // @ts-expect-error nor is a list without one
    listField('comments');
  });

  it('a reader only returns entries for its own field', () => {
    const raw = { name: 'n', models: [], siteArea: 3, comments: [], includeFarElements: true };
    for (const field of DOCUMENT_FIELDS) assert.deepEqual(Object.keys(field.read(raw)).filter((k) => k !== field.key), [], field.key);
  });

  it('reads the fields in the frozen order, and a field it does not name after them in registry order', () => {
    assert.deepEqual(new Set(FIELDS_IN_READ_ORDER.map((f) => f.key)), new Set(DOCUMENT_FIELDS.map((f) => f.key)));
    const unnamed = DOCUMENT_FIELDS.map((f) => f.key as string).filter((k) => !READ_ORDER.includes(k));
    const keys = FIELDS_IN_READ_ORDER.map((f) => f.key as string);
    assert.deepEqual(keys.slice(READ_ORDER.length), unnamed);
    assert.deepEqual(keys.slice(0, READ_ORDER.length), READ_ORDER.filter((k) => keys.includes(k)));
  });

  it('puts what the file has together in read order, and leaves out what it does not', () => {
    const doc = readDocumentFields({ siteArea: 5, name: 'p', sheetNumbering: undefined, hatchPatterns: 'x' });
    assert.deepEqual(Object.keys(doc).slice(0, 3), ['name', 'models', 'views']);
    assert.ok(Object.keys(doc).indexOf('hatchPatterns') < Object.keys(doc).indexOf('siteArea'));
    assert.equal('sheetNumbering' in doc, false);
    assert.equal('includeFarElements' in doc, false);
  });

  it('nothing the registry imports reaches the project store or the file reader, which import the registry', () => {
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const edge = /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+'([^']+)'/gms;
    const resolveSpec = (from: string, spec: string): string | null => {
      const base = spec.startsWith('@/') ? path.join(src, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
      if (!base) return null;
      const stem = base.replace(/\.js$/, '');
      return [`${stem}.ts`, `${stem}.tsx`, path.join(stem, 'index.ts'), path.join(stem, 'index.tsx')].find((c) => fs.existsSync(c)) ?? null;
    };
    const entry = path.join(src, 'project/fields/index.ts');
    const via = new Map<string, string | null>([[entry, null]]);
    for (const file of via.keys()) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(edge)) {
        const to = resolveSpec(file, m[1]);
        if (to && !via.has(to)) via.set(to, file);
      }
    }
    const chain = (file: string): string => (via.get(file) ? `${chain(via.get(file) as string)} -> ` : '') + path.relative(src, file);
    const bad = [...via.keys()].filter((f) => /\/project\/project-(store|file)\.ts$/.test(f)).map(chain);
    assert.deepEqual(bad, []);
  });
});
