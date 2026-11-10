/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The PAC checklist and opis (#364) against a four-storey building (a basement, the ground floor and two floors above it), no
 * parser or model file needed. Every expected Da / Nu / Nu este cazul is written out here from Legea 169/2026 Anexa 2, not
 * computed with `pacCoverage`: point 1.4.3 a) asks for "planurile indicative ale tuturor nivelurilor", and the last
 * sentence of 1.4.4 lifts documents for "intervențiile numai la interior".
 */

import { describe, expect, it } from 'vitest';
import {
  PAC_ITEMS, PAC_OPIS_ORDER, PAC_WORDS_EN, PAC_WORDS_RO, generateDefaultSet, pacCoverage, pacOpis, pacOpisOf, pacProjectName, pacSetTemplate, parseSetTemplate, serializeSetTemplate,
  type DefaultSet, type PacIntervention, type PacState, type SetModel,
} from './index.js';

const NAMES = { name: 'PAC', plans: 'Planuri de nivel', facades: 'Fațade', sections: 'Secțiuni principale' };

const BUILDING: SetModel = {
  storeys: [
    { name: 'Subsol', elevation: -3, globalId: 'g-1' },
    { name: 'Parter', elevation: 0, globalId: 'g0' },
    { name: 'Etaj 1', elevation: 3, globalId: 'g1' },
    { name: 'Etaj 2', elevation: 6, globalId: 'g2' },
  ],
  extent: { min: { x: 0, y: -3, z: 0 }, max: { x: 20, y: 9, z: 10 } },
  proposalInput: () => null,
};

const made = (): DefaultSet => generateDefaultSet(BUILDING, { setTemplate: pacSetTemplate(NAMES), now: 0 })!;

/** The Anexa 2 items in the order the Code numbers them, with their points. */
const ANEXA_2_ORDER = [
  ['siteLocation', '1.a, 1.1'], ['situationExisting', '1.b, 1.2'], ['situationProposed', '1.c, 1.3'], ['architectureMemo', '1.4.2'],
  ['plans', '1.4.3 a)'], ['roof', '1.4.3 a)'], ['facades', '1.4.3 a)'], ['sections', '1.4.3 a)'], ['context', '1.4.3 b)'],
  ['diagnosis', '1.4.4 a)'], ['structuralExpertise', '1.4.4 b), c)'], ['survey', '1.4.4 d)'], ['utilities', '1.5'],
  ['specialtyMemos', '1.6.1'], ['neighbourExpertise', '1.6.2'], ['geotechnical', '1.6.3'], ['calculationBrief', '1.6.4'], ['engineeringDrawings', '1.6.5'],
] as const;

const statesOf = (set: DefaultSet, works?: PacIntervention): Record<string, PacState> =>
  Object.fromEntries(pacCoverage(set.document.sheets, { views: set.document.views, intervention: works }).map((r) => [r.item.id, r.state]));

/** What the set of `made()` holds: plans of all four storeys and the four facades; the building offers no proposed section. */
const NEW_BUILDING: Record<string, PacState> = {
  siteLocation: 'no', situationExisting: 'no', situationProposed: 'no', plans: 'yes', roof: 'no', facades: 'yes', sections: 'no', context: 'no', utilities: 'no',
  engineeringDrawings: 'no', architectureMemo: 'no', specialtyMemos: 'no', neighbourExpertise: 'no', geotechnical: 'no', calculationBrief: 'no',
  diagnosis: 'na', structuralExpertise: 'na', survey: 'na',
};

describe('the PAC set draws a plan of every storey (1.4.3 a)', () => {
  it('puts the plans of all four storeys, lowest first, on the plans sheet', () => {
    const set = made();
    const plans = set.document.sheets.find((s) => s.name === NAMES.plans)!;
    const levels = (plans.viewports ?? []).map((vp) => set.document.views.find((v) => v.id === vp.viewId)).map((v) => (v?.kind === 'plan' ? v.level.name : null));
    expect(levels).toEqual(['Subsol', 'Parter', 'Etaj 1', 'Etaj 2']);
  });

  it('keeps the rule through the .bvset file', () => {
    const template = pacSetTemplate(NAMES);
    expect(parseSetTemplate(serializeSetTemplate(template))).toEqual(template);
    expect(template.sheets[0].slots).toEqual([{ view: { kind: 'allPlans' }, northArrow: true, scaleBar: true }]);
  });

  it('draws one plan for a model with a single storey and says nothing about the storeys it does not have', () => {
    const one = generateDefaultSet({ ...BUILDING, storeys: [{ name: 'Parter', elevation: 0, globalId: 'g0' }] }, { setTemplate: pacSetTemplate(NAMES), now: 0 })!;
    expect(one.document.sheets.find((s) => s.name === NAMES.plans)?.viewports?.length).toBe(1);
    expect(one.notes.filter((n) => n.key === 'setTemplate.note.skipped.plan')).toEqual([]);
  });
});

describe('"planurile tuturor nivelurilor" is Da only when every storey has a plan on a sheet', () => {
  it('is Da for the set the template makes', () => {
    const set = made();
    const rows = pacCoverage(set.document.sheets, { views: set.document.views });
    const plans = rows.find((r) => r.item.id === 'plans')!;
    expect(plans.state).toBe('yes');
    expect(plans.missingStoreys).toEqual([]);
  });

  it('is Nu, naming the storeys, when a sheet of the plans series holds only some of them', () => {
    const set = made();
    const ground = set.document.views.find((v) => v.kind === 'plan' && v.level.name === 'Parter')!;
    const sheets = set.document.sheets.map((s) => (s.name === NAMES.plans ? { ...s, viewports: (s.viewports ?? []).filter((vp) => vp.viewId === ground.id) } : s));
    const plans = pacCoverage(sheets, { views: set.document.views }).find((r) => r.item.id === 'plans')!;
    expect(plans.state).toBe('no');
    expect(plans.drawn).toBe(false);
    expect(plans.missingStoreys).toEqual(['Subsol', 'Etaj 1', 'Etaj 2']);
  });

  it('is Nu when the one storey missing is the topmost, and the opis says Nu', () => {
    const set = made();
    const top = set.document.views.find((v) => v.kind === 'plan' && v.level.name === 'Etaj 2')!;
    const sheets = set.document.sheets.map((s) => ({ ...s, viewports: (s.viewports ?? []).filter((vp) => vp.viewId !== top.id) }));
    const plans = pacCoverage(sheets, { views: set.document.views }).find((r) => r.item.id === 'plans')!;
    expect([plans.state, plans.missingStoreys]).toEqual(['no', ['Etaj 2']]);
    const opis = pacOpis(sheets, 'ro', 'Casa', { views: set.document.views });
    expect(opis.rows.find((r) => r.id === 'plans')?.state).toBe('no');
  });

  it('goes by the storey of the plan, not by the name of the series of the sheet it is on', () => {
    const set = made();
    // Every plan on one sheet that belongs to no series: still Da.
    const all = set.document.sheets.flatMap((s) => (s.name === NAMES.plans ? (s.viewports ?? []) : []));
    const unseries = [{ ...set.document.sheets[0], series: undefined, viewports: all }];
    expect(pacCoverage(unseries, { views: set.document.views }).find((r) => r.item.id === 'plans')?.state).toBe('yes');
    // A sheet of the plans series that holds an elevation instead of the plans: Nu.
    const elevation = set.document.sheets.flatMap((s) => (s.name === NAMES.facades ? (s.viewports ?? []).slice(0, 1) : []));
    const wrong = [{ ...set.document.sheets[0], series: 'plans' as const, viewports: elevation }];
    expect(pacCoverage(wrong, { views: set.document.views }).find((r) => r.item.id === 'plans')?.state).toBe('no');
  });

  it('is Nu with no sheets at all, and with no plan views', () => {
    const set = made();
    expect(pacCoverage([], { views: set.document.views }).find((r) => r.item.id === 'plans')?.missingStoreys).toEqual(['Subsol', 'Parter', 'Etaj 1', 'Etaj 2']);
    expect(pacCoverage(set.document.sheets, { views: [] }).find((r) => r.item.id === 'plans')?.state).toBe('no');
  });
});

describe('which items apply, per kind of works (Anexa 2 1.4.4)', () => {
  it('new building: point 1.4.4 does not apply, the rest is asked', () => {
    const set = made();
    expect(statesOf(set)).toEqual(NEW_BUILDING);
    expect(statesOf(set, 'new')).toEqual(NEW_BUILDING);
  });

  it('intervention on an existing building: 1.4.4 a) to d) are asked (Nu until supplied)', () => {
    expect(statesOf(made(), 'existing')).toEqual({ ...NEW_BUILDING, diagnosis: 'no', structuralExpertise: 'no', survey: 'no' });
  });

  it('interior only: the roof plan, the facades and the photo documentation (all inside 1.4) are Nu este cazul; the situation plans (1.b, 1.c), the plans, sections, utilities and 1.4.4 stay', () => {
    expect(statesOf(made(), 'interior')).toEqual({
      ...NEW_BUILDING, roof: 'na', facades: 'na', context: 'na', diagnosis: 'no', structuralExpertise: 'no', survey: 'no',
    });
  });

  it('writes the three answers in the words of each language', () => {
    const set = made();
    const rows = (locale: string) => pacOpis(set.document.sheets, locale, 'Casa', { views: set.document.views, intervention: 'interior' });
    const ro = rows('ro');
    const en = rows('en');
    expect([ro.yes, ro.no, ro.na]).toEqual(['Da', 'Nu', 'Nu este cazul']);
    expect([en.yes, en.no, en.na]).toEqual(['Yes', 'No', 'Not applicable']);
    expect(ro.rows.find((r) => r.id === 'facades')?.state).toBe('na');
    expect(PAC_WORDS_RO['pac.opis.na']).toBe('Nu este cazul');
    expect(PAC_WORDS_EN['pac.opis.na']).toBe('Not applicable');
  });

  it('lists every Anexa 2 item once, in Anexa 2 order', () => {
    expect([...PAC_OPIS_ORDER]).toEqual(ANEXA_2_ORDER.map(([id]) => id));
    expect(PAC_ITEMS.map((i) => [i.id, i.point]).sort()).toEqual(ANEXA_2_ORDER.map((r) => [...r]).sort());
    expect(pacOpis([], 'ro', '', { views: [] }).rows.map((r) => r.id)).toEqual(ANEXA_2_ORDER.map(([id]) => id));
  });
});

describe('the project name on the opis', () => {
  it('is the title block project field of the first sheet that has one, else the project field, else the set name', () => {
    const set = made();
    const sheets = set.document.sheets;
    const base = { name: 'Setul', sheets, views: set.document.views };
    expect(pacProjectName(base)).toBe('Setul');
    expect(pacProjectName({ ...base, titleBlock: { project: 'Casa Popescu' } })).toBe('Casa Popescu');
    expect(pacProjectName({ ...base, sheets: [{ ...sheets[0], titleBlock: { project: 'Alt nume' } }, ...sheets.slice(1)], titleBlock: { project: 'Casa Popescu' } })).toBe('Alt nume');
    expect(pacOpisOf({ ...base, titleBlock: { project: 'Casa Popescu' } }, 'ro').project).toBe('Proiect: Casa Popescu');
  });
});
