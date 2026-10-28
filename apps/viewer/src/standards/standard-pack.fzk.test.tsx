/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Standards packs (#365) on AC20-FZK-Haus, through the app's own start of a project: installing the Romanian pack changes
 * the pens and hatch weights, the title block, the number format and the lettering to the pack's values, the sheets read
 * them from where they always did, one undo puts every part back, and a project that never installs one is not touched.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sheetFormat, sheetNumber } from '@bimvoice/ifcsheet/names';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { DEFAULT_GRAPHIC_STANDARD, ROMANIAN_PRACTICE, graphicStandardOf } from '@/drafting/graphic-standard';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { parseCatalogue } from '@/catalogue/catalogue-file';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { openProjectDocument, parseProjectFile, serializeProject } from '@/project/project-file';
import { projectDocument, resetProject, setUnitsAndNumbers, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { romanianTitleBlock } from '@/project/title-block-ro';
import { resolve } from '@/i18n/registry';
import { useViewerStore } from '@/store';
import { cleanup, render } from '@/test/render.js';
import { standardsSection } from '@/components/viewer/wall/drawer-sections/standards';
import { setOpeningConvention } from '@/joinery/opening-convention';
import { romaniaPack } from './standard-pack';
import { parseStandardPack, serializeStandardPack } from './standard-pack-file';
import { installStandard, isApplied, resetStandard } from './standard-pack-install';

/** A caption is its own key here: the layout is compared with itself, whatever the language. */
const t = (key: string): string => key;
const pack = () => romaniaPack(t as never);
const state = () => useProjectStore.getState();

/** Every part a pack can set, as the project holds it (keys sorted: a file read back may write them in another order). */
const sorted = (_key: string, v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const parts = () => JSON.stringify({
  graphicStandard: state().graphicStandard, textStyles: state().textStyles, dimStyles: state().dimStyles, titleBlockTemplate: state().titleBlockTemplate,
  unitsAndNumbers: state().unitsAndNumbers, sheetNumbering: state().sheetNumbering, installedStandard: state().installedStandard,
}, sorted);

describe('the Romanian standards pack on AC20-FZK-Haus (#365)', { skip: planModelMissing(FZK_HAUS) }, () => {
  before(async () => { await loadPlanModel(FZK_HAUS); });

  beforeEach(() => {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const extent = setExtent(state().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    clearDraftHistory();
  });

  it('a project that never installs one is unchanged: no standard, no layout of its own, no format, and nothing saved', () => {
    const s = state();
    assert.equal(s.graphicStandard, undefined);
    assert.equal(s.titleBlockTemplate, undefined);
    assert.equal(s.unitsAndNumbers, undefined);
    assert.equal(s.sheetNumbering, undefined);
    assert.equal(s.installedStandard, undefined);
    assert.equal(graphicStandardOf(s.graphicStandard), DEFAULT_GRAPHIC_STANDARD);
    assert.equal('installedStandard' in JSON.parse(serializeProject(projectDocument())), false);
  });

  it('installing it sets the pens, hatch weights, lettering, title block and number format to the pack\'s values, and the sheets read them', () => {
    const sheetsBefore = JSON.stringify(state().sheets.map((s) => s.number));
    installStandard(pack());
    const s = state();
    // Pens and hatch weights: the Romanian graphic standard's values, not the default's.
    assert.equal(s.graphicStandard, 'ro-practice');
    const standard = graphicStandardOf(s.graphicStandard);
    assert.deepEqual(standard.pens, { cut: 0.7, outline: 0.35, seen: 0.25, hidden: 0.18, hatch: 0.13 });
    assert.deepEqual(standard.weights, {
      heavy: { cut: 0.7, projection: 0.35 }, medium: { cut: 0.5, projection: 0.25 },
      light: { cut: 0.35, projection: 0.18 }, hairline: { cut: 0.18, projection: 0.13 },
    });
    assert.deepEqual(standard.materialHatch, { heavy: 0.35, medium: 0.25, light: 0.18, hairline: 0.13 });
    assert.deepEqual(standard.sheet, { frame: 0.7, titleOuter: 0.5, titleDivider: 0.35, titleRule: 0.18 });
    assert.notDeepEqual(standard.pens, DEFAULT_GRAPHIC_STANDARD.pens);
    // The styles the standard brings, and the one new annotations take.
    assert.deepEqual(s.textStyles?.map((x) => x.id).filter((id) => id.startsWith('ro-')), ['ro-text-25', 'ro-text-35', 'ro-title-50', 'ro-title-70']);
    assert.deepEqual(s.dimStyles?.map((x) => x.id).filter((id) => id.startsWith('ro-')), ['ro-dim']);
    // The title block: the Romanian layout, drawn with the Romanian pens, now the project's own.
    assert.deepEqual(s.titleBlockTemplate, romanianTitleBlock(t as never, ROMANIAN_PRACTICE));
    assert.equal(s.titleBlockTemplate?.items[0].kind, 'rect');
    assert.equal(s.titleBlockTemplate?.items.length, romanianTitleBlock(t as never, ROMANIAN_PRACTICE).items.length);
    // Units and number format: a comma, and nothing else invented.
    assert.deepEqual(s.unitsAndNumbers, { separator: 'comma' });
    assert.equal(sheetNumber(sheetFormat('en', s.unitsAndNumbers), 1234.5, 2), '1.234,50');
    assert.equal(sheetNumber(sheetFormat('en', undefined), 1234.5, 2), '1,234.50');
    // Numbering: the pack encodes no Romanian scheme, so the project's stays, and no sheet is renumbered.
    assert.equal(s.sheetNumbering, undefined);
    assert.equal(JSON.stringify(s.sheets.map((x) => x.number)), sheetsBefore);
    assert.deepEqual(s.installedStandard, { id: 'ro-stas', version: 1, previous: { graphicStandard: null, openingLines: null, titleBlockTemplate: null, unitsAndNumbers: null } });
    assert.equal(isApplied(pack()), true);
  });

  it('one undo puts every part back, one redo applies them again, and there is no second step', () => {
    const before = parts();
    installStandard(pack());
    const after = parts();
    assert.notEqual(after, before);
    assert.equal(undoDrafts(), true);
    assert.equal(parts(), before, 'one undo returns every part to the project\'s own');
    assert.equal(undoDrafts(), false, 'and it was the only step');
    assert.equal(redoDrafts(), true);
    assert.equal(parts(), after);
    assert.equal(redoDrafts(), false);
  });

  it('installing it again changes nothing and leaves no step', () => {
    installStandard(pack());
    const once = parts();
    installStandard(pack());
    assert.equal(parts(), once);
    assert.equal(undoDrafts(), true);
    assert.equal(undoDrafts(), false, 'the second install made no step of its own');
  });

  it('keeps the project\'s own values: it sets only what it carries, "reset" puts the project\'s values back exactly, and a second install does not overwrite them', () => {
    setUnitsAndNumbers({ lengthUnit: 'cm', separator: 'point', decimals: { length: 1 } });
    useProjectStore.setState({ titleBlockTemplate: { items: [{ id: 'x', kind: 'text', x: 1, y: 1, size: 3, text: 'Mine' }] } });
    const mine = parts();
    installStandard(pack());
    assert.deepEqual(state().unitsAndNumbers, { lengthUnit: 'cm', separator: 'comma', decimals: { length: 1 } });
    // A change after the install, then the pack again: the values kept are still the project's own, not the pack's.
    setUnitsAndNumbers({ separator: 'point' });
    installStandard(pack());
    assert.equal(state().installedStandard?.previous.unitsAndNumbers?.separator, 'point');
    assert.equal(resetStandard(), true);
    assert.equal(state().graphicStandard, undefined);
    assert.equal(state().installedStandard, undefined);
    assert.deepEqual(state().titleBlockTemplate, { items: [{ id: 'x', kind: 'text', x: 1, y: 1, size: 3, text: 'Mine' }] });
    assert.deepEqual(state().unitsAndNumbers, { lengthUnit: 'cm', separator: 'point', decimals: { length: 1 } });
    assert.equal(resetStandard(), false, 'nothing is installed any more');
    assert.notEqual(mine, '');
  });

  it('reset puts back the direction of the opening lines the project had, not the one the pack\'s standard names (#448)', () => {
    setOpeningConvention('hinge');
    installStandard(pack());
    assert.equal(state().openingLines, 'handle', 'the pack\'s standard sets the direction');
    assert.equal(resetStandard(), true);
    assert.equal(state().openingLines, 'hinge');
    // A project that never chose one has none stored again after the reset.
    useProjectStore.setState({ openingLines: undefined });
    installStandard(pack());
    assert.equal(resetStandard(), true);
    assert.equal(state().openingLines, undefined);
  });

  it('reset is one undo step too', () => {
    installStandard(pack());
    const installed = parts();
    clearDraftHistory();
    assert.equal(resetStandard(), true);
    assert.notEqual(parts(), installed);
    assert.equal(undoDrafts(), true);
    assert.equal(parts(), installed);
    assert.equal(undoDrafts(), false);
  });

  it('round-trips through .bvlib: the file is a library the library reads, and the pack read back installs the same project', () => {
    const text = serializeStandardPack(pack(), new Date(0));
    const library = parseCatalogue(text);
    assert.equal(library.catalogue.graphicStandard, 'ro-practice');
    assert.deepEqual(library.catalogue.textStyles.map((x) => x.id), ['ro-text-25', 'ro-text-35', 'ro-title-50', 'ro-title-70']);
    const back = parseStandardPack(text);
    assert.deepEqual(back, { ...pack(), name: 'România: STAS / ISO 128' });
    assert.deepEqual(JSON.parse(serializeStandardPack(back, new Date(0))), JSON.parse(text));
    installStandard(back);
    const fromFile = parts();
    undoDrafts();
    installStandard(pack());
    assert.equal(parts(), fromFile);
  });

  it('refuses a file that is not a pack, or names a standard this app does not have, and installs nothing', () => {
    const text = serializeStandardPack(pack(), new Date(0));
    const file = JSON.parse(text) as Record<string, unknown>;
    const { standardPack: _manifest, ...library } = file;
    assert.throws(() => parseStandardPack(JSON.stringify(library)), /Not a standards pack: "standardPack" is missing/);
    assert.throws(() => parseStandardPack(JSON.stringify({ ...file, graphicStandard: 'din-9999' })), /"din-9999" is not in this version/);
    assert.throws(() => parseStandardPack(JSON.stringify({ ...file, standardPack: { ...(file.standardPack as object), version: 'x' } })), /no version/);
    assert.equal(state().installedStandard, undefined);
  });

  it('is saved with the project and read back with it', () => {
    installStandard(pack());
    const doc = JSON.parse(serializeProject(projectDocument())) as { installedStandard?: unknown; graphicStandard?: string };
    assert.deepEqual(doc.installedStandard, state().installedStandard);
    assert.equal(doc.graphicStandard, 'ro-practice');
  });

  // #404: the file writes a part's keys in another order than the pack lists them (`"bold":true,"fit":36` for `"fit":36,"bold":true`),
  // and `isApplied` compared the parts as JSON text, so a reopened project read "installed" in the line and offered "Install" in the button.
  it('a project reopened from its file is still as the pack leaves it: the button reads Installed, not Install (#404)', () => {
    // The pack the drawer offers: its captions are the app's own words, as the card builds it.
    const offered = romaniaPack(resolve as never);
    installStandard(offered);
    const before = state().titleBlockTemplate;
    const text = serializeProject(projectDocument());
    // The cause, as the issue found it: the reader writes the title block's keys in another order than the pack lists them.
    assert.notEqual(JSON.stringify(parseProjectFile(text).titleBlockTemplate), JSON.stringify(before), 'the reopened title block has its keys in another order');
    resetProject();
    assert.equal(isApplied(offered), false);
    openProjectDocument(parseProjectFile(text));
    assert.equal(isApplied(offered), true);
    const Section = standardsSection.component;
    const buttons = [...render(<Section go={() => {}} onClose={() => {}} extent={null} />).querySelectorAll('button')].map((b) => ({ text: b.textContent, disabled: b.disabled }));
    cleanup();
    assert.deepEqual(buttons.filter((b) => b.text === 'Installed'), [{ text: 'Installed', disabled: true }], JSON.stringify(buttons));
    assert.equal(buttons.some((b) => /Install standard/i.test(b.text ?? '')), false, JSON.stringify(buttons));
  });
});
