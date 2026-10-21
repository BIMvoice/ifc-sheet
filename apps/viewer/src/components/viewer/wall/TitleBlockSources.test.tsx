/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { EntityExtractor } from '@ifc-lite/parser';
import { planFor } from '@/issue/run';
import { blur, cleanup, click, press, render, type } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { attachDraftingView, cancelCommand, clickDrawing, runningCommand, startDraftCommand } from '@/drafting/session';
import { resetProject, useProjectStore } from '@/project/project-store';
import { setProjectTitleBlockField, setTitleBlockSources } from '@/project/sheets';
import { effectiveTitleBlock, modelFacts, resolvedTitleBlock } from '@/project/title-block-model';
import { resolveTitleBlock } from '@/project/title-block-sources';
import { TITLE_BLOCK_FIELDS } from '@/project/title-block';
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from '../sheets/SheetPaper';
import { sheetSvgText } from '../sheets/sheet-export';
import { ProjectDrawer } from './ProjectDrawer.js';

/**
 * The title block fields over real parsed models: FZK-Haus (what an
 * authoring tool really writes) and a model that carries what FZK lacks (an
 * address, a named organisation, a client actor, a property). The sheets
 * print what the mapping says, a typed value beats it, and the Romanian
 * letters arrive as written.
 */

const fzkStep = () => readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc'));

// Romanian letters as STEP writes them (\X2\ escapes): Ștefan Țăran, Cluj-Napoca, Strada Împăcării, Bulevardul Eroilor Nr. 12 (ș ț ă î â).
const RO = (s: string): string => [...s].map((c) => (c.charCodeAt(0) > 127 ? `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\` : c)).join('');
const SYNTHETIC = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPERSON($,'${RO('Țăran')}','${RO('Ștefan')}',$,$,$,$,$);
#2=IFCORGANIZATION($,'${RO('Birou de arhitectură Îmbinări')}',$,$,$);
#3=IFCPERSONANDORGANIZATION(#1,#2,$);
#4=IFCORGANIZATION($,'Graphisoft',$,$,$);
#5=IFCAPPLICATION(#4,'27','ARCHICAD','AC');
#6=IFCOWNERHISTORY(#3,#5,$,.ADDED.,$,$,$,1);
#10=IFCPOSTALADDRESS(.SITE.,$,$,$,('${RO('Strada Împăcării 12')}'),$,'Cluj-Napoca',$,'400000','${RO('România')}');
#11=IFCPROJECT('0lY6P5Ur90TAQnnnI6wt01',#6,'Casa',$,$,'${RO('Casa Țăran')}','${RO('Faza DTAC')}',$,$);
#12=IFCSITE('0lY6P5Ur90TAQnnnI6wt02',#6,'Teren',$,$,$,$,$,.ELEMENT.,$,$,$,'CF 123456',#10);
#13=IFCBUILDING('0lY6P5Ur90TAQnnnI6wt03',#6,'Casa',$,$,$,$,$,.ELEMENT.,$,$,$);
#20=IFCACTORROLE(.CLIENT.,$,$);
#21=IFCORGANIZATION($,'${RO('Primăria Cluj')}',$,(#20),$);
#22=IFCACTOR('0lY6P5Ur90TAQnnnI6wt04',$,$,$,$,#21);
#23=IFCRELASSIGNSTOACTOR('0lY6P5Ur90TAQnnnI6wt05',$,$,$,(#11),$,#22,#20);
#30=IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('P-2026-014'),$);
#31=IFCPROPERTYSET('0lY6P5Ur90TAQnnnI6wt06',$,'Pset_ProjectCommon',$,(#30));
#32=IFCRELDEFINESBYPROPERTIES('0lY6P5Ur90TAQnnnI6wt07',$,$,$,(#11),#31);
ENDSEC;
END-ISO-10303-21;`;

async function load(step: string | Uint8Array, id: string): Promise<void> {
  const store = await parseStep(step);
  seedModel(id, 0, store, 1);
}

beforeEach(() => {
  cancelCommand();
  resetProject();
  useViewerStore.setState({ models: new Map() });
});
afterEach(() => cleanup());

const field = (name: string) => resolvedTitleBlock(useProjectStore.getState().titleBlock, useProjectStore.getState().titleBlockSources)[name];

describe('FZK-Haus: what the model carries', () => {
  beforeEach(async () => load(fzkStep(), 'fzk'));

  it('fills the project name from IfcProject; the file has no address and its only organisation is a placeholder', () => {
    assert.deepEqual([field('project').value, field('project').from], ['Projekt-FZK-Haus', 'model']);
    // IfcSite.SiteAddress and IfcBuilding.BuildingAddress are $ in the file.
    assert.deepEqual([field('address').value, field('address').from], ['', 'none']);
    // The owning user's organisation is "Nicht definiert" (not defined): printing it would be wrong. The software vendor is GRAPHISOFT.
    assert.deepEqual([field('organisation').value, field('organisation').from], ['', 'none']);
    assert.equal(modelFacts().owner('organisation'), 'Nicht definiert');
    assert.equal(modelFacts().owner('developer'), 'GRAPHISOFT');
    assert.equal(modelFacts().owner('application'), 'ARCHICAD-64 20.0.0');
    assert.equal(modelFacts().attribute('IfcSite', 'Name'), 'Gelaende');
    assert.equal(modelFacts().attribute('IfcBuilding', 'Name'), 'FZK-Haus');
  });

  it('the organisation can be taken from the application developer, and is then GRAPHISOFT', () => {
    setTitleBlockSources('organisation', [{ kind: 'owner', part: 'developer' }]);
    assert.deepEqual([field('organisation').value, field('organisation').from], ['GRAPHISOFT', 'model']);
  });
});

describe('a model that carries an address, an organisation, a client and a property', () => {
  beforeEach(async () => load(SYNTHETIC, 'syn'));

  it('fills project, address and organisation from the model by default', () => {
    const all = resolveTitleBlock(TITLE_BLOCK_FIELDS, {}, undefined, modelFacts());
    assert.equal(all.project.value, 'Casa Țăran', 'the long name wins over the name');
    assert.equal(all.address.value, 'Strada Împăcării 12, 400000 Cluj-Napoca, România');
    assert.equal(all.organisation.value, 'Birou de arhitectură Îmbinări');
    // Drawn by and Client read the model only when a source is picked (#114 review).
    // The revision is not a title block field: it is the sheet's latest revision record (#133).
    assert.deepEqual([all.drawnBy.from, all.client.from, all.checkedBy.from, all.date.from], ['none', 'none', 'none', 'none']);
  });

  it('reads phase, land title number and a property path', () => {
    const f = modelFacts();
    assert.equal(f.attribute('IfcProject', 'Phase'), 'Faza DTAC');
    assert.equal(f.attribute('IfcSite', 'LandTitleNumber'), 'CF 123456');
    assert.equal(f.property(undefined, 'Pset_ProjectCommon', 'Reference'), 'P-2026-014');
    assert.equal(f.property('IfcSite', 'Pset_ProjectCommon', 'Reference'), '');
    setTitleBlockSources('checkedBy', [{ kind: 'pset', pset: 'Pset_ProjectCommon', property: 'Reference' }]);
    assert.equal(field('checkedBy').value, 'P-2026-014');
  });

  it('a typed value wins over the mapping, and the badge data says so', () => {
    setProjectTitleBlockField('organisation', 'Typed office');
    assert.deepEqual([field('organisation').value, field('organisation').from], ['Typed office', 'typed']);
    assert.equal(effectiveTitleBlock().organisation, 'Typed office');
  });
});

const sheet = (id: string, number: string): ProjectSheet => ({ id, number, autoNumber: false, name: number, createdAt: 1, paper: 'A1', orientation: 'landscape', viewports: [] });

function svgOf(s: ProjectSheet): string {
  const ui = render(<SheetPaper sheet={s} projectName="Untitled" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: undefined, drawing: null, drafts: [] })} />);
  const svg = ui.querySelector('svg');
  assert.ok(svg, 'the sheet draws');
  const text = sheetSvgText(svg as unknown as SVGSVGElement, s);
  cleanup();
  return text;
}

describe('the sheets follow the mapping', () => {
  beforeEach(async () => {
    await load(SYNTHETIC, 'syn');
    useProjectStore.setState({ sheets: [sheet('s1', 'A-101'), sheet('s2', 'A-102')] });
  });

  it('prints the model\'s values on two sheets, and a mapping change changes both', () => {
    const [a, b] = useProjectStore.getState().sheets;
    for (const s of [a, b]) assert.match(svgOf(s), /Birou de arhitectură Îmbinări/);
    assert.doesNotMatch(svgOf(a), /Graphisoft/);
    setTitleBlockSources('organisation', [{ kind: 'owner', part: 'developer' }]);
    for (const s of [a, b]) {
      const svg = svgOf(s);
      assert.match(svg, /Graphisoft/);
      assert.doesNotMatch(svg, /Birou de arhitectur/);
    }
  });

  it('a sheet\'s own field still wins over the project\'s, mapped or typed', () => {
    useProjectStore.setState({ sheets: [{ ...sheet('s1', 'A-101'), titleBlock: { organisation: 'Only here' } }, sheet('s2', 'A-102')] });
    const [a, b] = useProjectStore.getState().sheets;
    assert.match(svgOf(a), /Only here/);
    assert.doesNotMatch(svgOf(b), /Only here/);
  });

  it('prints the Romanian letters ș ț ă î â exactly as typed, and as the model has them', () => {
    const typed = 'Ședința Țării: Păun în Bâlea';
    setProjectTitleBlockField('client', typed);
    const [a, b] = useProjectStore.getState().sheets;
    for (const s of [a, b]) {
      const svg = svgOf(s);
      assert.ok(svg.includes(`>${typed}<`), 'the typed client is in the SVG verbatim');
      assert.ok(svg.includes('>Strada Împăcării 12, 400000 Cluj-Napoca, România<'), 'the model\'s address is in the SVG verbatim');
    }
  });
});

const select = (ui: HTMLElement, label: RegExp): HTMLSelectElement => {
  const found = [...ui.querySelectorAll('select')].find((s) => label.test(s.getAttribute('aria-label') ?? ''));
  assert.ok(found, `a select ${String(label)}`);
  return found;
};
const textInput = (ui: HTMLElement, label: string): HTMLInputElement => {
  const found = [...ui.querySelectorAll('label')].find((l) => l.firstElementChild?.textContent?.startsWith(label))?.querySelector('input');
  assert.ok(found, `a field ${label}`);
  return found;
};
const change = (el: HTMLSelectElement, value: string): void => {
  act(() => {
    el.value = value;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
};
const EXTENT = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

describe('the Title block form', () => {
  beforeEach(async () => load(SYNTHETIC, 'syn'));

  it('shows each value with its source, lets the person pick another, type over it, and reset to the model', () => {
    const ui = render(<ProjectDrawer extent={EXTENT} onClose={() => {}} />);
    const row = (name: string): string => textInput(ui, name).closest('div')?.textContent ?? '';
    assert.equal(textInput(ui, 'Project').value, 'Casa Țăran');
    assert.match(row('Project'), /from IfcProject\.LongName/);
    assert.equal(textInput(ui, 'Address').value, 'Strada Împăcării 12, 400000 Cluj-Napoca, România');
    assert.match(row('Address'), /from IfcSite\.SiteAddress/);
    assert.match(row('Organisation'), /from Owner history: organisation/);
    assert.match(row('Checked by'), /not in the model/);

    // Pick another source for the organisation.
    change(select(ui, /Take Organisation from/), String(12));
    assert.equal(textInput(ui, 'Organisation').value, 'Graphisoft');
    assert.deepEqual(useProjectStore.getState().titleBlockSources, { organisation: [{ kind: 'owner', part: 'developer' }] });

    // Type over it: the badge says typed, the mapping is still there.
    type(textInput(ui, 'Organisation'), 'My office');
    blur(textInput(ui, 'Organisation'));
    assert.equal(useProjectStore.getState().titleBlock?.organisation, 'My office');
    assert.match(row('Organisation'), /typed/);

    // Leaving a model-filled field alone does not copy its value in as typed.
    blur(textInput(ui, 'Address'));
    assert.equal(useProjectStore.getState().titleBlock?.address, undefined);

    // Reset to model: the typed value and the chosen source both go.
    const reset = [...textInput(ui, 'Organisation').closest('div')!.querySelectorAll('button')].find((b) => b.textContent === 'Reset to model');
    assert.ok(reset);
    click(reset);
    assert.equal(useProjectStore.getState().titleBlock?.organisation, undefined);
    assert.equal(useProjectStore.getState().titleBlockSources, undefined);
    assert.equal(textInput(ui, 'Organisation').value, 'Birou de arhitectură Îmbinări');
  });

  it('takes a property path for a field', () => {
    const ui = render(<ProjectDrawer extent={EXTENT} onClose={() => {}} />);
    change(select(ui, /Take Checked by from/), 'pset');
    const path = [...ui.querySelectorAll('input')].find((i) => /Property of Checked by/.test(i.getAttribute('aria-label') ?? ''));
    assert.ok(path);
    type(path, 'Pset_ProjectCommon.Reference');
    blur(path);
    assert.deepEqual(useProjectStore.getState().titleBlockSources, { checkedBy: [{ kind: 'pset', pset: 'Pset_ProjectCommon', property: 'Reference' }] });
    assert.equal(textInput(ui, 'Checked by').value, 'P-2026-014');
  });

  it('keeps its keys with a tool running and with none: Enter in a field commits it and never confirms the tool', () => {
    attachDraftingView('plan-1', 'down', () => []);
    for (const running of [false, true]) {
      cancelCommand();
      if (running) {
        startDraftCommand('line');
        clickDrawing({ x: 1, y: 1 }, 0.05, false);
        assert.ok(runningCommand(), 'LINE waits for its second point');
      }
      const ui = render(<ProjectDrawer extent={EXTENT} onClose={() => {}} />);
      const input = textInput(ui, 'Client');
      assert.equal(input.hasAttribute('data-owns-keys'), true);
      type(input, `Cluj ${running}`);
      press(input, 'Enter');
      assert.equal(useProjectStore.getState().titleBlock?.client, undefined, 'Enter blurs; the value lands on the blur');
      blur(input);
      assert.equal(useProjectStore.getState().titleBlock?.client, `Cluj ${running}`);
      assert.equal(Boolean(runningCommand()), running, 'the tool is as it was');
      act(() => setProjectTitleBlockField('client', ''));
      cleanup();
    }
  });
});

describe('review round of #114', () => {
  beforeEach(async () => load(SYNTHETIC, 'syn'));

  it('reads the model once per model and edit, however many sheets and title blocks ask', () => {
    const proto = EntityExtractor.prototype;
    const original = proto.extractEntity;
    let parsed = 0;
    proto.extractEntity = function (this: EntityExtractor, ...args: Parameters<typeof original>) { parsed++; return original.apply(this, args); };
    try {
      useProjectStore.setState({ sheets: Array.from({ length: 12 }, (_, i) => sheet(`s${i}`, `A-${100 + i}`)) });
      const first = effectiveTitleBlock();
      const once = parsed;
      assert.ok(once > 0, 'the first read parses the records it needs');
      // The issue run asks once per sheet; each mounted title block asks again.
      for (const s of useProjectStore.getState().sheets) assert.deepEqual(effectiveTitleBlock(), first, `${s.number} prints the same`);
      for (const s of useProjectStore.getState().sheets.slice(0, 3)) svgOf(s);
      planFor({});
      assert.equal(parsed, once, 'nothing parsed again while the model and its edits are the same');
      // An edit is a new state of the model: read again, once.
      useViewerStore.setState({ mutationVersion: useViewerStore.getState().mutationVersion + 1 });
      effectiveTitleBlock();
      const twice = parsed;
      assert.ok(twice > once, 'an edit reads the model again');
      effectiveTitleBlock();
      assert.equal(parsed, twice);
    } finally {
      proto.extractEntity = original;
    }
  });

  it('leaves Drawn by and Client with no source unless one is picked, so an older set prints what it printed', () => {
    // The model names an OwnerHistory person and a CLIENT actor; neither is printed until the office picks it.
    assert.equal(modelFacts().owner('person'), 'Ștefan Țăran');
    assert.equal(modelFacts().actor('CLIENT'), 'Primăria Cluj');
    // A project saved before the title block read the model: what was typed, and nothing else for these two.
    useProjectStore.setState({ titleBlock: { checkedBy: 'IC', date: '2026-09-01' }, sheets: [sheet('s1', 'A-101')] });
    assert.deepEqual([field('drawnBy').from, field('client').from], ['none', 'none']);
    assert.equal(effectiveTitleBlock().drawnBy, undefined);
    assert.equal(effectiveTitleBlock().client, undefined);
    const svg = svgOf(useProjectStore.getState().sheets[0]);
    assert.doesNotMatch(svg, /Ștefan Țăran|Primăria Cluj/);
    // Picked, they read the model.
    setTitleBlockSources('drawnBy', [{ kind: 'owner', part: 'person' }]);
    setTitleBlockSources('client', [{ kind: 'actor', role: 'CLIENT' }]);
    assert.equal(effectiveTitleBlock().drawnBy, 'Ștefan Țăran');
    assert.equal(effectiveTitleBlock().client, 'Primăria Cluj');
  });

  it('blanks a field the model fills with the "none" source, and the default brings it back', () => {
    const ui = render(<ProjectDrawer extent={EXTENT} onClose={() => {}} />);
    assert.equal(textInput(ui, 'Address').value, 'Strada Împăcării 12, 400000 Cluj-Napoca, România');
    change(select(ui, /Take Address from/), 'none');
    assert.deepEqual(useProjectStore.getState().titleBlockSources, { address: [] });
    assert.equal(textInput(ui, 'Address').value, '');
    assert.equal(select(ui, /Take Address from/).value, 'none', 'the picker shows the choice');
    assert.equal(effectiveTitleBlock().address, undefined);
    cleanup();
    assert.doesNotMatch(svgOf(sheet('s1', 'A-101')), /Strada Împăcării/);
    const again = render(<ProjectDrawer extent={EXTENT} onClose={() => {}} />);
    change(select(again, /Take Address from/), 'default');
    assert.equal(useProjectStore.getState().titleBlockSources, undefined);
    assert.equal(textInput(again, 'Address').value, 'Strada Împăcării 12, 400000 Cluj-Napoca, România');
  });
});
