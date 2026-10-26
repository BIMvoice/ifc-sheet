/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectDocument as EngineDocument } from '@bimvoice/ifcsheet';
import { sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { setProjectTitleBlockField } from '@/project/sheets';
import { applyRomanianTitleBlock } from '@/project/title-block-template-actions';
import { effectiveTitleBlock } from '@/project/title-block-model';
import { romanianTitleBlock } from '@/project/title-block-ro';
import { titleBlockRoRo } from '@/i18n/catalogues/title-block-ro.ro';
import type { ProjectLevel, ProjectSheet } from '@/project/types';
import { SheetPaper } from '../sheets/SheetPaper';
import { ProjectDrawer } from './ProjectDrawer.js';
import { useWallNav } from './wall-nav.js';

/**
 * The Romanian title block on the Wall (#54): the phase and the roles come
 * from the model's IfcProject and IfcPerson / IfcOrganization data and a typed
 * value beats them; the layout is the project's, prints on every sheet, and
 * prints the same in the app and in the engine package (the PDF and CLI);
 * a project that does not choose it prints what it printed.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
const ro = (k: string): string => (titleBlockRoRo as Record<string, string>)[k] ?? k;

// The project's phase, an architect and a project manager as IfcPerson with their roles, the owner organisation.
const MODEL = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCACTORROLE(.ARCHITECT.,$,$);
#2=IFCACTORROLE(.PROJECTMANAGER.,$,$);
#3=IFCPERSON($,'Popescu','Ana',$,$,$,(#1),$);
#4=IFCPERSON($,'Ionescu','Ion',$,$,$,(#2),$);
#5=IFCORGANIZATION($,'Birou de arhitectur\\X2\\0103\\X0\\ Alfa',$,$,$);
#6=IFCPERSONANDORGANIZATION(#3,#5,$);
#7=IFCORGANIZATION($,'Graphisoft',$,$,$);
#8=IFCAPPLICATION(#7,'27','ARCHICAD','AC');
#9=IFCOWNERHISTORY(#6,#8,$,.ADDED.,$,$,$,1);
#11=IFCPROJECT('0lY6P5Ur90TAQnnnI6wt01',#9,'Casa',$,$,'Casa Popescu','DTAC',$,$);
#20=IFCACTOR('0lY6P5Ur90TAQnnnI6wt04',$,$,$,$,#3);
#21=IFCACTOR('0lY6P5Ur90TAQnnnI6wt05',$,$,$,$,#4);
#22=IFCRELASSIGNSTOACTOR('0lY6P5Ur90TAQnnnI6wt06',$,$,$,(#11),$,#20,$);
#23=IFCRELASSIGNSTOACTOR('0lY6P5Ur90TAQnnnI6wt07',$,$,$,(#11),$,#21,$);
ENDSEC;
END-ISO-10303-21;`;

beforeEach(() => {
  resetProject();
  useViewerStore.setState({ models: new Map() });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: 'drawer' });
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

const loadModel = async (): Promise<void> => seedModel('m', 0, await parseStep(MODEL), 11);

/** The title block's texts as the sheet's paper prints them (its viewports left out). */
function printed(sheet: ProjectSheet): string[] {
  const ui = render(
    <SheetPaper sheet={{ ...sheet, viewports: [] }} projectName={useProjectStore.getState().name} content={() => ({ view: undefined, drawing: null, drafts: [] })}
      layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
  );
  const out = [...ui.querySelectorAll('[data-title-block] text')].map((t) => t.textContent ?? '');
  cleanup();
  return out;
}

/** The F_01 datums (Ordinul 975/2026, Anexa 4) beyond the original fields, by title block field. */
const F01_VALUES: Record<string, string> = {
  registrationNumber: 'J40/1234/2020', projectManagerTitle: 'arh. Ionescu', designerTitle: 'arhitect', drawnByTitle: 'desenator', authorsCapacity: 'proiectant de arhitectură',
  verifierCapacity: 'verificator atestat', verifierRequirement: 'A1', reportNumber: 'RV-77', reportDate: '2026-10-20',
};

const chooseRomanian = (): void => applyRomanianTitleBlock(romanianTitleBlock(ro as never));

describe('the fields read the model\'s IfcProject and its actors', () => {
  it('phase from IfcProject.Phase, the project manager and the architect from the actors by role, the proiectant general from the owner organisation', async () => {
    await loadModel();
    const f = effectiveTitleBlock();
    assert.deepEqual([f.phase, f.projectManager, f.designer, f.organisation], ['DTAC', 'Ion Ionescu', 'Ana Popescu', 'Birou de arhitectură Alfa']);
  });

  it('a typed value beats the model, and the model fills a field again when the typed value is cleared', async () => {
    await loadModel();
    setProjectTitleBlockField('phase', 'PTh');
    setProjectTitleBlockField('designer', 'Maria Vasilescu');
    assert.deepEqual([effectiveTitleBlock().phase, effectiveTitleBlock().designer, effectiveTitleBlock().projectManager], ['PTh', 'Maria Vasilescu', 'Ion Ionescu']);
    setProjectTitleBlockField('phase', '');
    assert.equal(effectiveTitleBlock().phase, 'DTAC');
  });
});

describe('the Romanian layout on every sheet', () => {
  it('chosen once, prints the model\'s phase and roles with Romanian captions on every sheet', async () => {
    await loadModel();
    chooseRomanian();
    const sheets = useProjectStore.getState().sheets;
    assert.ok(sheets.length >= 2);
    for (const s of sheets) {
      const texts = printed(s);
      for (const want of ['Proiectant general', 'Birou de arhitectură Alfa', 'Faza', 'DTAC', 'Șef proiect', 'Ion Ionescu', 'Proiectat', 'Ana Popescu', 'Semnătura', 'Titlu proiect', 'Planșa nr.', s.number]) {
        assert.ok(texts.includes(want), `${s.number} prints "${want}": ${texts.join(' | ')}`);
      }
    }
  });

  it('is chosen from the project drawer, keeps with the project, and a typed project number prints on every sheet', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    const choose = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Use the Romanian layout');
    assert.ok(choose, 'the drawer offers the layout');
    click(choose);
    const kept = useProjectStore.getState().titleBlockTemplate;
    assert.ok(kept && kept.items.some((i) => i.kind === 'text' && i.text === '{ProjectPhase}'), 'the layout is the project\'s own');
    const number = [...ui.querySelectorAll('label')].find((l) => l.firstElementChild?.textContent?.startsWith('Project no.'))?.querySelector('input');
    assert.ok(number, 'a Project no. field');
    type(number, 'P-2026-014');
    blur(number);
    for (const s of useProjectStore.getState().sheets) assert.ok(printed(s).includes('P-2026-014'), `${s.number} prints the project number`);
  });

  it('is the same on screen and in the engine: the same texts, in the same order', async () => {
    await loadModel();
    setProjectTitleBlockField('projectNumber', 'P-2026-014');
    setProjectTitleBlockField('drawnBy', 'D. Marin');
    for (const [k, v] of Object.entries(F01_VALUES)) setProjectTitleBlockField(k, v);
    chooseRomanian();
    const s = useProjectStore.getState();
    const doc: EngineDocument = { name: s.name, models: [], views: [], sheets: s.sheets, titleBlock: effectiveTitleBlock(), titleBlockTemplate: s.titleBlockTemplate, titleBlockParams: s.titleBlockParams };
    for (const sheet of s.sheets) {
      const engine = sheetGraphic({ ...sheet, viewports: [] }, doc, new Map()).texts.map((t) => t.text);
      // The scale is the one shared rule (`sheetScaleLine`): a dash for a sheet with no drawing, on screen and in the engine alike. Only an empty text differs (the engine leaves it out).
      const app = printed(sheet).filter((t) => t !== '');
      assert.deepEqual(app, engine, `${sheet.number}`);
      assert.ok(engine.includes('—'), `${sheet.number} states a dash for the scale it does not have`);
      for (const v of Object.values(F01_VALUES)) assert.ok(engine.includes(v) && app.includes(v), `${sheet.number} F_01 "${v}" engine=${engine.includes(v)} app=${app.includes(v)}: ${engine.join('|')} // ${app.join('|')}`);
    }
  });
});

describe('a project that does not choose it', () => {
  it('prints the standard layout as before: no Romanian caption, no phase, even with a model that has one', async () => {
    await loadModel();
    const [s] = useProjectStore.getState().sheets;
    const texts = printed(s);
    assert.equal(useProjectStore.getState().titleBlockTemplate, undefined);
    assert.ok(texts.includes('Nr. planșă') || texts.includes('Sheet no.'));
    for (const absent of ['DTAC', 'Ion Ionescu', 'Faza', 'Phase', 'Șef proiect', 'Project manager']) assert.ok(!texts.includes(absent), `no "${absent}"`);
  });

  it('parameters the project defined before the new fields still print their own values, {Phase} and a name like {ProjectNumber} alike', async () => {
    await loadModel();
    setProjectTitleBlockField('projectNumber', 'P-2026-014');
    useProjectStore.setState({
      titleBlockParams: [{ name: 'Phase', value: 'Studiu de fezabilitate' }, { name: 'ProjectNumber', value: 'vechi' }],
      titleBlockTemplate: { items: [{ id: 'p', kind: 'text', x: 5, y: 8, size: 3, text: 'Faza: {Phase}, nr. {ProjectNumber}' }] },
    });
    assert.deepEqual(printed(useProjectStore.getState().sheets[0]), ['Faza: Studiu de fezabilitate, nr. vechi']);
  });
});
