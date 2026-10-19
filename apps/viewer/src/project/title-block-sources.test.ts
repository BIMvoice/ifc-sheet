/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SOURCES, effectiveFields, readTitleSources, resolveField, resolveTitleBlock, withSources, type ModelFacts, type TitleSource } from './title-block-sources';
import { TITLE_BLOCK_FIELDS } from './title-block';

/**
 * The resolver over a synthetic model: typed beats the mapping, the mapping
 * is an ordered list whose first non-empty source wins, and a field the
 * code has never heard of still resolves from a list keyed by its id.
 */

const facts = (over: Partial<Record<string, string>> = {}): ModelFacts => ({
  attribute: (on, name) => over[`${on}.${name}`] ?? '',
  property: (on, pset, property) => over[`${on ?? '*'}:${pset}.${property}`] ?? '',
  owner: (part) => over[`owner.${part}`] ?? '',
  actor: (role) => over[`actor.${role}`] ?? '',
});

const name: TitleSource = { kind: 'attribute', on: 'IfcProject', name: 'Name' };
const longName: TitleSource = { kind: 'attribute', on: 'IfcProject', name: 'LongName' };

describe('resolveField', () => {
  it('reads the first source that has a value, in order', () => {
    const f = facts({ 'IfcProject.Name': 'Casa', 'IfcProject.LongName': 'Casa Lunga' });
    assert.deepEqual(resolveField('x', {}, { x: [longName, name] }, f), { value: 'Casa Lunga', from: 'model', source: longName });
    assert.deepEqual(resolveField('x', {}, { x: [name, longName] }, f), { value: 'Casa', from: 'model', source: name });
  });

  it('skips an empty source and a placeholder the authoring tool wrote, and takes the next', () => {
    const f = facts({ 'IfcProject.LongName': '   ', 'IfcProject.Name': 'Casa', 'owner.organisation': 'Nicht definiert' });
    assert.equal(resolveField('x', {}, { x: [longName, name] }, f).value, 'Casa');
    assert.deepEqual(resolveField('organisation', {}, undefined, f), { value: '', from: 'none' });
  });

  it('a typed value beats every source; an empty typed value does not', () => {
    const f = facts({ 'IfcProject.Name': 'Casa' });
    assert.deepEqual(resolveField('x', { x: 'Typed' }, { x: [name] }, f), { value: 'Typed', from: 'typed' });
    assert.equal(resolveField('x', { x: '' }, { x: [name] }, f).from, 'model');
  });

  it('an empty list is an answer: the field reads nothing', () => {
    assert.deepEqual(resolveField('project', {}, { project: [] }, facts({ 'IfcProject.Name': 'Casa' })), { value: '', from: 'none' });
  });

  it('a field id the code does not know resolves from a list keyed by that id', () => {
    const f = facts({ '*:Pset_ProjectCommon.PermitNumber': 'AC-14/2026' });
    const permit: TitleSource = { kind: 'pset', pset: 'Pset_ProjectCommon', property: 'PermitNumber' };
    assert.equal(resolveField('permitNumber', {}, undefined, f).from, 'none');
    assert.equal(resolveField('permitNumber', {}, { permitNumber: [permit] }, f).value, 'AC-14/2026');
  });

  it('reads the owner history and the actor with the role', () => {
    const f = facts({ 'owner.organisation': 'Studio', 'owner.person': 'Ana Pop', 'actor.CLIENT': 'Primăria' });
    const all = resolveTitleBlock(TITLE_BLOCK_FIELDS, {}, undefined, f);
    assert.deepEqual([all.organisation.value, all.drawnBy.value, all.client.value], ['Studio', 'Ana Pop', 'Primăria']);
  });
});

describe('the defaults', () => {
  it('cover project, address, client, organisation and drawn by, and no field the model cannot know', () => {
    assert.deepEqual(Object.keys(DEFAULT_SOURCES).sort(), ['address', 'client', 'drawnBy', 'organisation', 'project']);
    for (const field of ['checkedBy', 'date', 'revision']) assert.equal(DEFAULT_SOURCES[field], undefined);
  });

  it('the project is its long name, else its name; the address is the site\'s, else the building\'s', () => {
    assert.equal(resolveField('project', {}, undefined, facts({ 'IfcProject.Name': 'N', 'IfcProject.LongName': 'L' })).value, 'L');
    assert.equal(resolveField('project', {}, undefined, facts({ 'IfcProject.Name': 'N' })).value, 'N');
    assert.equal(resolveField('address', {}, undefined, facts({ 'IfcSite.SiteAddress': 'S', 'IfcBuilding.BuildingAddress': 'B' })).value, 'S');
    assert.equal(resolveField('address', {}, undefined, facts({ 'IfcBuilding.BuildingAddress': 'B' })).value, 'B');
  });
});

describe('effectiveFields', () => {
  it('prints typed and mapped values over the typed record, and keeps the logo', () => {
    const f = facts({ 'IfcProject.Name': 'Casa' });
    const typed = { client: 'Typed', logo: 'data:image/png;base64,AA==' };
    assert.deepEqual(effectiveFields(resolveTitleBlock(TITLE_BLOCK_FIELDS, typed, undefined, f), typed), { client: 'Typed', logo: 'data:image/png;base64,AA==', project: 'Casa' });
  });
});

describe('withSources and readTitleSources', () => {
  it('the default removes the entry; another list is kept', () => {
    assert.equal(withSources({ project: [name] }, 'project', DEFAULT_SOURCES.project), undefined);
    assert.deepEqual(withSources(undefined, 'project', [name]), { project: [name] });
    assert.equal(withSources({ project: [name] }, 'project', undefined), undefined);
  });

  it('reads what it writes, drops what is not a source, and keeps an empty list', () => {
    const saved = { project: [name, { kind: 'pset', pset: 'Pset_X', property: 'Y', on: 'IfcSite' }, { kind: 'owner', part: 'developer' }, { kind: 'actor', role: 'CLIENT' }], address: [], bad: [{ kind: 'nope' }, { kind: 'owner', part: 'cook' }, 5], notAList: 'x' };
    assert.deepEqual(readTitleSources(JSON.parse(JSON.stringify(saved))), { project: saved.project, address: [], bad: [] });
    assert.equal(readTitleSources([]), undefined);
    assert.equal(readTitleSources(undefined), undefined);
  });
});
