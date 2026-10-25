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
import { DOCUMENT_FIELDS, emptyDocument, loadedFields } from './index';
import { listField, optionalField, recordField } from './define';
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

const base = { name: 'p', models: [], views: [], sheets: [], drafts: [], draftLayers: [] } as unknown as ProjectDocument;

describe('the document field registry', () => {
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
    const field = listField('comments');
    assert.deepEqual([field.empty?.(), field.fallback?.(), field.load?.(undefined)], [[], [], []]);
    assert.notEqual(field.empty?.(), field.empty?.(), 'each call is a fresh list');
    const kept = [{ id: 'c' }] as unknown as ProjectDocument['comments'];
    assert.equal(field.load?.(kept), kept);
  });

  it('a record field is {} when new, written as {} when missing and loaded as {} when absent', () => {
    const field = recordField('seriesTemplates');
    assert.deepEqual([field.empty?.(), field.fallback?.(), field.load?.(undefined)], [{}, {}, {}]);
  });

  it('an optional field is undefined when new, has no fallback, and an absent one clears the store on load', () => {
    const field = optionalField('siteArea');
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

  it('field files import no value from the project store or the file reader, which import them', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const edge = /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+'([^']+)'/gms;
    const bad = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)).flatMap((f) =>
      [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(edge)].map((m) => m[1]).filter((spec) => /(^|\/)project-(store|file)(\.js)?$/.test(spec)).map((spec) => `${f} -> ${spec}`));
    assert.deepEqual(bad, []);
  });
});
