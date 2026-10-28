/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A project's graphic standard and title block layout, as the engine reads them (#365). */

import { describe, expect, it } from 'vitest';
import { GERMAN_PRACTICE, ROMANIAN_PRACTICE, romaniaPack } from './index.js';
import { readProjectFile } from './project-read.js';
import { buildStandard } from './cli-standard.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const file = (extra: Record<string, unknown>): string => JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', ...extra });
const pack = romaniaPack((key) => key);

describe('readProjectFile: graphic standard and title block layout', () => {
  it('a file that names neither carries neither', () => {
    const facts = readProjectFile(file({}));
    expect(facts.graphicStandard).toBeUndefined();
    expect(facts.titleBlockTemplate).toBeUndefined();
    expect(facts.unknownGraphicStandard).toBeUndefined();
    expect(readProjectFile(file({ graphicStandard: 'default' })).graphicStandard).toBeUndefined();
  });

  it('the Romanian standard and a saved layout are read', () => {
    const facts = readProjectFile(file({ graphicStandard: 'ro-practice', titleBlockTemplate: pack.titleBlockTemplate }));
    expect(facts.graphicStandard).toBe(ROMANIAN_PRACTICE);
    expect(facts.titleBlockTemplate?.items.length).toBe(pack.titleBlockTemplate?.items.length);
  });

  it('a standard from a newer app is named, not guessed, and the build falls back to the default pens with a note', () => {
    const facts = readProjectFile(file({ graphicStandard: 'din-2030' }));
    expect(facts.graphicStandard).toBeUndefined();
    expect(facts.unknownGraphicStandard).toBe('din-2030');
    const standard = buildStandard(undefined, facts);
    expect(standard?.pens).toBeUndefined();
    expect(standard?.notes[0]).toContain('din-2030');
  });
});

describe('buildStandard: the German pack', () => {
  it('--standard de (and the pack id de-din) applies the German pens, captions and comma, none of them the Romanian pack\'s', () => {
    for (const id of ['de', 'de-din']) {
      const de = buildStandard(id, undefined);
      expect(de?.pens?.pens).toEqual({ cut: 0.5, outline: 0.25, seen: 0.25, hidden: 0.25, hatch: 0.13 });
      expect(de?.unitsAndNumbers).toEqual({ separator: 'comma' });
      const texts = de?.titleBlockTemplate?.items.flatMap((i) => (i.kind === 'text' ? [i.text] : [])) ?? [];
      for (const caption of ['Bauvorhaben', 'Bauherr', 'Entwurfsverfasser', 'Planinhalt', 'Gezeichnet', 'Geprüft', 'Datum', 'Index', 'Maßstab']) expect(texts, caption).toContain(caption);
      expect(texts).not.toContain('Proiectant general');
    }
    const ro = buildStandard('ro', undefined);
    expect(buildStandard('de', undefined)?.pens?.pens.cut).not.toBe(ro?.pens?.pens.cut);
  });

  it('a project saved with the German standard is read as it', () => {
    expect(readProjectFile(file({ graphicStandard: 'de-practice' })).graphicStandard).toBe(GERMAN_PRACTICE);
  });
});

describe('buildStandard', () => {
  it('nothing chosen: nothing to apply', () => {
    expect(buildStandard(undefined, undefined)).toEqual({ notes: [] });
  });

  it('--standard ro applies the pack\'s pens and layout; an unknown id is null; the pack\'s own id is accepted', () => {
    const ro = buildStandard('ro', undefined);
    expect(ro?.pens?.pens.cut).toBe(0.7);
    expect(ro?.titleBlockTemplate?.items.some((i) => i.kind === 'text' && i.text === 'Proiectant general')).toBe(true);
    expect(buildStandard('ro-stas', undefined)?.pens?.pens.cut).toBe(0.7);
    expect(buildStandard('xx', undefined)).toBeNull();
  });

  it('--standard wins over the project\'s own standard', () => {
    const facts = readProjectFile(file({ graphicStandard: 'default', titleBlockTemplate: { items: [{ id: 'a', kind: 'text', x: 1, y: 1, size: 3, text: 'Mine' }] } }));
    const ro = buildStandard('ro', facts);
    expect(ro?.titleBlockTemplate?.items.some((i) => i.kind === 'text' && i.text === 'Mine')).toBe(false);
    expect(buildStandard(undefined, facts)?.titleBlockTemplate?.items[0]).toMatchObject({ text: 'Mine' });
  });
});
