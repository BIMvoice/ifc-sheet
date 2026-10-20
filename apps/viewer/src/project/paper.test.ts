/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ELONGATED_MM, ELONGATED_PAPERS, paperFromLabel, paperLabel, paperMm, readPaper } from './paper.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { paperOf } from './sheets.js';
import { EMPTY_PROJECT } from './project-store.js';
import type { ProjectSheet } from './types.js';

/**
 * Paper sizes: the A-series, the ISO 5457 elongated formats and custom
 * sizes, and a paper read from a file in every shape it has been stored in.
 */

const sheet = (extra: Partial<ProjectSheet>): ProjectSheet => ({ id: 's', number: 'A-101', name: 'n', createdAt: 0, ...extra });

describe('paper sizes', () => {
  it('knows the ISO 5457 elongated sizes (short × long, mm)', () => {
    const want: Record<string, [number, number]> = {
      'A3×3': [420, 891], 'A3×4': [420, 1189], 'A2×3': [594, 1261], 'A4×3': [297, 630], 'A4×4': [297, 841], 'A0×2': [1189, 1682], 'A1×3': [841, 1783],
    };
    for (const [label, [short, long]] of Object.entries(want)) assert.deepEqual(ELONGATED_MM[label], { short, long }, label);
    assert.equal(ELONGATED_PAPERS.length, Object.keys(ELONGATED_MM).length);
  });

  it('makes A4×5 1050 mm long, as ISO 5457 lists it', () => {
    assert.deepEqual(ELONGATED_MM['A4×5'], { short: 297, long: 1050 });
  });

  it('lays an elongated sheet long side across in landscape, down in portrait', () => {
    const a3x3 = { kind: 'elongated', base: 'A3', factor: 3 } as const;
    assert.deepEqual(paperMm(a3x3), { w: 891, h: 420 });
    assert.deepEqual(paperMm(a3x3, 'portrait'), { w: 420, h: 891 });
    assert.deepEqual(paperOf(sheet({ paper: a3x3, orientation: 'portrait' })), { w: 420, h: 891 });
  });

  it('lays a custom size the same way, whichever side was typed first', () => {
    const custom = { kind: 'custom', widthMm: 500, heightMm: 700 } as const;
    assert.deepEqual(paperMm(custom, 'portrait'), { w: 500, h: 700 });
    assert.deepEqual(paperMm(custom, 'landscape'), { w: 700, h: 500 });
    assert.deepEqual(paperMm({ kind: 'custom', widthMm: 700, heightMm: 500 }, 'portrait'), { w: 500, h: 700 });
  });

  it('names and reads a paper back from its label', () => {
    for (const paper of ['A1', { kind: 'elongated', base: 'A2', factor: 3 }, { kind: 'custom', widthMm: 500, heightMm: 700 }] as const) {
      const label = paperLabel(paper);
      assert.deepEqual(paperMm(paperFromLabel(label)!), paperMm(paper), label);
    }
    assert.equal(paperLabel({ kind: 'custom', widthMm: 500, heightMm: 700 }), '700×500');
    assert.equal(paperFromLabel('B5'), undefined);
    assert.equal(paperFromLabel('A3×9'), undefined);
  });
});

describe('reading a paper from a file', () => {
  it('reads a plain A-series name as that ISO size, as every file saved before elongated sizes holds it', () => {
    assert.equal(readPaper('A1'), 'A1');
    assert.equal(readPaper({ kind: 'iso', size: 'A3' }), 'A3');
  });

  it('reads an elongated and a custom size, and drops what is none', () => {
    assert.deepEqual(readPaper({ kind: 'elongated', base: 'A3', factor: 3 }), { kind: 'elongated', base: 'A3', factor: 3 });
    assert.deepEqual(readPaper({ kind: 'custom', widthMm: 500, heightMm: 700 }), { kind: 'custom', widthMm: 500, heightMm: 700 });
    for (const bad of ['B5', 7, null, { kind: 'elongated', base: 'A3', factor: 9 }, { kind: 'custom', widthMm: 5, heightMm: 700 }, { kind: 'custom', widthMm: 500 }, { kind: 'iso', size: 'A9' }]) {
      assert.equal(readPaper(bad), undefined, JSON.stringify(bad));
    }
  });

  it('opens a project file saved with paper: "A1" as ISO A1 (841 × 594 mm)', () => {
    const old = JSON.parse(serializeProject({ ...EMPTY_PROJECT, sheets: [sheet({ paper: 'A1', orientation: 'landscape' })] }));
    old.sheets[0].paper = 'A1';
    delete old.sheets[0].frame;
    const [loaded] = parseProjectFile(JSON.stringify(old)).sheets;
    assert.equal(loaded.paper, 'A1');
    assert.deepEqual(paperOf(loaded), { w: 841, h: 594 });
    assert.equal(loaded.frame, undefined, 'a sheet with no frame keeps the default one');
  });

  it('opens a project file with the object form of a paper, and one with a paper it does not know', () => {
    const file = JSON.parse(serializeProject({ ...EMPTY_PROJECT, sheets: [sheet({}), sheet({ id: 't' })] }));
    file.sheets[0].paper = { kind: 'elongated', base: 'A3', factor: 3 };
    file.sheets[1].paper = 'B5';
    const [a, b] = parseProjectFile(JSON.stringify(file)).sheets;
    assert.deepEqual(paperOf(a), { w: 891, h: 420 });
    assert.equal(b.paper, undefined);
  });
});
