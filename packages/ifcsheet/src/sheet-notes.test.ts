/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The notes a set template's sheets print on themselves when they leave the paper or the scale the rules asked for (#364):
 * the text in both languages, absent on a sheet that fits, and drawn by the engine's sheet layout.
 */

import { describe, expect, it } from 'vitest';
import { generateDefaultSet, pacRuralSetTemplate, sheetNoteLines, type SetModel } from './index.js';
import { sheetGraphic } from './sheet-graphic.js';

const NAMES = { name: 'PAC simplificat', plans: 'Planuri de nivel', facades: 'Fațade', sections: 'Secțiuni principale' };
const building = (x: number, y: number, z: number): SetModel => ({
  projectName: 'House', storeys: [{ name: 'Ground', elevation: 0 }, { name: 'First', elevation: 3 }], extent: { min: { x: 0, y: 0, z: 0 }, max: { x, y, z } }, proposalInput: () => null,
});
const made = (m: SetModel, locale?: string) => generateDefaultSet(m, { setTemplate: pacRuralSetTemplate(NAMES), now: 0, ...(locale ? { locale } : {}) })!;
const plan = (set: ReturnType<typeof made>) => set.document.sheets.find((s) => s.name === 'Planuri de nivel 1')!;

describe('the note a stepped-up or rescaled sheet prints on itself', () => {
  it('a plan that does not fit A3 at 1:50 and moves to A2 says so, in English and in Romanian', () => {
    expect(plan(made(building(12, 7, 12))).notes).toEqual(['Format A2: the drawing does not fit A3 at 1:50.']);
    expect(plan(made(building(12, 7, 12), 'ro')).notes).toEqual(['Format A2: desenul nu încape pe A3 la 1:50.']);
  });

  it('a drawing too large for A1 at 1:50 says the paper and the new scale', () => {
    const sheet = plan(made(building(60, 7, 12)));
    const used = sheet.viewports![0].scale;
    expect(sheet.paper).toBe('A1');
    expect(sheet.notes).toEqual(['Format A1: the drawing does not fit A3 at 1:50.', `Scale 1:${used}: the drawing does not fit A1 at 1:50.`]);
    expect(plan(made(building(60, 7, 12), 'ro')).notes).toEqual(['Format A1: desenul nu încape pe A3 la 1:50.', `Scara 1:${used}: desenul nu încape pe A1 la 1:50.`]);
  });

  it('a sheet that fits A3 at 1:50 carries no note', () => {
    const set = made(building(12, 7, 8));
    expect(set.document.sheets.filter((s) => s.notes !== undefined)).toEqual([]);
  });

  it('the engine\'s sheet draws the note lines, inside the frame, once each', () => {
    const set = made(building(12, 7, 12));
    const sheet = plan(set);
    const graphic = sheetGraphic(sheet, set.document, new Map());
    const lines = sheetNoteLines(sheet);
    expect(lines.map((l) => l.text)).toEqual(sheet.notes);
    for (const line of lines) {
      expect(graphic.texts.filter((t) => t.text === line.text && t.at.x === line.at.x && t.at.y === line.at.y)).toHaveLength(1);
      expect(line.at.x).toBeGreaterThan(10);
      expect(line.at.y).toBeLessThan(graphic.paper.h - 10);
    }
    const quiet = made(building(12, 7, 8));
    expect(sheetGraphic(plan(quiet), quiet.document, new Map()).texts.some((t) => t.text.startsWith('Format'))).toBe(false);
  });
});
