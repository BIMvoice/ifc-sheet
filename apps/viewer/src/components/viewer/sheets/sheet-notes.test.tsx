/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateDefaultSet, pacRuralSetTemplate, type DefaultSet, type ProjectDocument } from '@bimvoice/ifcsheet';
import { sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { cleanup, render } from '@/test/render.js';
import { projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from './SheetPaper';

/**
 * A sheet a set template had to put on a larger paper (or rescale) says so on itself (#364). The sheet on screen and the engine's
 * sheet (what the PDF and DXF draw) print the same lines in the same places, and a sheet that fits prints none.
 */

const NAMES = { name: 'PAC simplificat', plans: 'Planuri de nivel', facades: 'Fațade', sections: 'Secțiuni principale' };
const house = (x: number, z: number): DefaultSet => generateDefaultSet({
  projectName: 'House', storeys: [{ name: 'Ground', elevation: 0 }, { name: 'First', elevation: 3 }], extent: { min: { x: 0, y: 0, z: 0 }, max: { x, y: 7, z } }, proposalInput: () => null,
}, { setTemplate: pacRuralSetTemplate(NAMES), now: 0 })!;
const planOf = (set: DefaultSet): ProjectSheet => set.document.sheets.find((s) => s.name === 'Planuri de nivel 1')!;
const content = () => ({ view: undefined, drawing: null, drafts: [] });

/** What the app's sheet prints as notes: text, x, y. */
const onScreen = (sheet: ProjectSheet) => {
  const ui = render(<SheetPaper sheet={sheet} projectName="House" content={content} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  return [...ui.querySelectorAll('[data-sheet-notes] text')].map((t) => ({ text: t.textContent, x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')) }));
};
/** What the engine's sheet holds for the same notes. */
const inEngine = (sheet: ProjectSheet, doc: ProjectDocument) => sheetGraphic(sheet, doc, new Map()).texts
  .filter((t) => (sheet.notes ?? []).includes(t.text)).map((t) => ({ text: t.text, x: t.at.x, y: t.at.y }));

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('the note on a stepped-up sheet', () => {
  it('is printed by the screen and the engine alike, line for line and place for place', () => {
    const set = house(12, 12);
    const sheet = planOf(set);
    assert.deepEqual(sheet.notes, ['Format A2: the drawing does not fit A3 at 1:50.']);
    const screen = onScreen(sheet);
    assert.equal(screen.length, 1);
    assert.deepEqual(screen, inEngine(sheet, set.document));
  });

  it('a sheet that fits A3 at 1:50 prints no note, on screen or in the engine', () => {
    const set = house(12, 8);
    const sheet = planOf(set);
    assert.equal(sheet.notes, undefined);
    assert.deepEqual(onScreen(sheet), []);
    assert.deepEqual(sheetGraphic(sheet, set.document, new Map()).texts.filter((t) => /^(Format A|Scale 1:)/.test(t.text)), []);
  });

  it('is kept by the project file', () => {
    const sheet = planOf(house(12, 12));
    useProjectStore.setState({ sheets: [sheet] });
    const back = parseProjectFile(serializeProject(projectDocument()));
    assert.deepEqual(back.sheets[0].notes, sheet.notes);
  });
});
