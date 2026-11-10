/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The annotate-the-set choices and presets as pure functions (#707). */

import { describe, expect, it } from 'vitest';
import { ALL_CHOICES, choicesFrom, choicesOfTemplate, commandsFor } from './choices.js';
import { effectiveOptions, readAnnotationPresets, withoutPreset, withPreset, type AnnotationOptions } from './presets.js';

const options: AnnotationOptions = { on: { tagall: true, dimall: false, levelall: true }, tagParts: { doors: true, windows: false, rooms: false } as AnnotationOptions['tagParts'] };

describe('annotate choices', () => {
  it('runs TAGALL before DIMALL on a plan, LEVELALL on a section, nothing on a sheet', () => {
    expect(commandsFor({ kind: 'plan' }, ALL_CHOICES)).toEqual(['tagall', 'dimall']);
    expect(commandsFor({ kind: 'section' }, ALL_CHOICES)).toEqual(['tagall', 'levelall']);
    expect(commandsFor({ kind: 'detail' }, ALL_CHOICES)).toEqual([]);
    expect(choicesFrom({ tagall: false, dimall: true, levelall: false }).plan).toEqual(['dimall']);
  });
  it('reads a set template per series', () => {
    expect(choicesOfTemplate({ annotations: { plans: ['dimAll'], sections: ['levelAll'] } })).toEqual({ plan: ['dimall'], elevation: [], section: ['levelall'] });
  });
});

describe('annotation presets', () => {
  it('switches TAGALL off when no kind of label is chosen', () => {
    expect(effectiveOptions({ ...options, tagParts: { doors: false, windows: false, rooms: false } as AnnotationOptions['tagParts'] }).on.tagall).toBe(false);
    expect(effectiveOptions(options).on.tagall).toBe(true);
  });
  it('replaces a preset of the same name in any case and keeps its id; a blank name saves nothing', () => {
    let n = 0;
    const first = withPreset([], ' Show ', options, () => `p${++n}`);
    const again = withPreset(first.presets, 'SHOW', { ...options, on: { ...options.on, dimall: true } }, () => `p${++n}`);
    expect(again.presets).toHaveLength(1);
    expect(again.saved?.id).toBe('p1');
    expect(withPreset(again.presets, '  ', options, () => 'x')).toEqual({ presets: again.presets, saved: null });
    expect(withoutPreset(again.presets, 'p1')).toEqual([]);
    expect(withoutPreset(again.presets, 'nope')).toBe(again.presets);
  });
  it('drops unusable entries from a file and turns a missing switch off', () => {
    const read = readAnnotationPresets([{ id: 'a', name: 'A', on: { tagall: true } }, { id: 'a', name: 'dup' }, { name: 'no id' }, 7]);
    expect(read).toHaveLength(1);
    expect(read[0].on).toEqual({ tagall: true, dimall: false, levelall: false });
  });
});
