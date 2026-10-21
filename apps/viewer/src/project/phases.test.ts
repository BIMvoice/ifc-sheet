/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PHASE_STYLES, itemInk, phaseInk, phaseOfStatus, phaseStyle, resolvePhase, shownPhases, type PhaseReader, type PhaseSource } from './phases.js';

const set = (name: string, props: Record<string, unknown>) => ({ name, properties: Object.entries(props).map(([n, value]) => ({ name: n, value })) });
const el = (own: ReturnType<typeof set>[] = [], type: ReturnType<typeof set>[] = []): PhaseReader => ({ propertySets: () => own, typePropertySets: () => type });

describe('phase of an element', () => {
  it('reads the Status of its own Pset_*Common', () => {
    assert.equal(resolvePhase(el([set('Pset_WallCommon', { Status: 'DEMOLISH' })])), 'demolish');
    assert.equal(resolvePhase(el([set('Pset_DoorCommon', { Status: 'NEW' })])), 'new');
    assert.equal(resolvePhase(el([set('Pset_SlabCommon', { Status: 'TEMPORARY' })])), 'temporary');
    assert.equal(resolvePhase(el([set('Pset_WallCommon', { Status: 'EXISTING' })]), { unmarked: 'new' }), 'existing');
  });

  it('falls back to the Status of its type, and its own wins over it', () => {
    assert.equal(resolvePhase(el([], [set('Pset_WallCommon', { Status: 'NEW' })])), 'new');
    assert.equal(resolvePhase(el([set('Pset_WallCommon', { Status: 'DEMOLISH' })], [set('Pset_WallCommon', { Status: 'NEW' })])), 'demolish');
  });

  it('reads an IFC2X3 label, an enumeration list and set and property names in any case', () => {
    assert.equal(resolvePhase(el([set('pset_wallcommon', { status: ' demolish ' })])), 'demolish');
    assert.equal(resolvePhase(el([set('Pset_WallCommon', { Status: ['NEW'] })])), 'new');
    assert.equal(phaseOfStatus('.NEW.'), 'new');
  });

  it('ignores a Status outside a Pset_*Common, and values that name no phase', () => {
    assert.equal(resolvePhase(el([set('Pset_Other', { Status: 'DEMOLISH' })])), 'existing');
    for (const v of ['OTHER', 'NOTKNOWN', 'UNSET', '', 7, null, undefined]) assert.equal(phaseOfStatus(v), null, String(v));
    assert.equal(resolvePhase(el([set('Pset_WallCommon', { Status: 'NOTKNOWN' })]), { unmarked: 'new' }), 'new');
  });

  it('reads the project mapped property, its values without case, and it wins over Status where it has a value', () => {
    const source: PhaseSource = { mapping: { set: 'Faza', property: 'Stare', values: { Existent: 'existing', 'De desfiintat': 'demolish', Propus: 'new' } } };
    assert.equal(resolvePhase(el([set('Faza', { Stare: 'de desfiintat' })]), source), 'demolish');
    assert.equal(resolvePhase(el([set('Faza', { Stare: 'PROPUS' }), set('Pset_WallCommon', { Status: 'DEMOLISH' })]), source), 'new');
    assert.equal(resolvePhase(el([], [set('Faza', { Stare: 'Propus' })]), source), 'new', 'the type carries it');
    // A value the table does not know, or no value: the Status decides.
    assert.equal(resolvePhase(el([set('Faza', { Stare: 'altceva' }), set('Pset_WallCommon', { Status: 'DEMOLISH' })]), source), 'demolish');
    assert.equal(resolvePhase(el([set('Pset_WallCommon', { Status: 'NEW' })]), source), 'new');
  });

  it('counts an element with no phase as EXISTING, or as the project says', () => {
    assert.equal(resolvePhase(el()), 'existing');
    assert.equal(resolvePhase(el(), {}), 'existing');
    assert.equal(resolvePhase(el(), { unmarked: 'new' }), 'new');
  });
});

describe('phase styles', () => {
  it('ship black and white: existing thin grey, to demolish dashed, new heavy black', () => {
    assert.deepEqual(['existing', 'demolish', 'new'].map((p) => phaseInk(undefined, p as 'new').weightMm), [0.25, 0.5, 0.7]);
    assert.equal(phaseInk(undefined, 'existing').color, '#808080');
    assert.deepEqual(phaseInk(undefined, 'existing').dash, []);
    assert.ok(phaseInk(undefined, 'demolish').dash.length > 0);
    assert.equal(phaseInk(undefined, 'new').color, '#000000');
  });

  it('a view changes a style field by field, over the default', () => {
    const graphics = { phases: { show: ['new' as const], styles: { new: { lineColor: '#ff0000' }, demolish: { dashed: false } } } };
    assert.deepEqual(phaseStyle(graphics, 'new'), { ...DEFAULT_PHASE_STYLES.new, lineColor: '#ff0000' });
    assert.deepEqual(phaseInk(graphics, 'demolish').dash, []);
    assert.equal(phaseInk(graphics, 'demolish').weightMm, 0.5);
  });

  it('a view with no phases shows every element alike', () => {
    assert.equal(shownPhases(undefined), null);
    assert.equal(shownPhases({ presetId: null }), null);
    assert.deepEqual([...shownPhases({ phases: { show: ['existing', 'new'] } })!], ['existing', 'new']);
    assert.equal(itemInk(undefined, {}), null);
    assert.equal(itemInk(undefined, { phase: 'new' })?.weightMm, 0.7);
  });
});
