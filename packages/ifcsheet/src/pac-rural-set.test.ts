/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The paper rule of the rural PAC set (#364), on buildings made of numbers: one view per sheet at 1:50, A3 landscape
 * where the view fits, the next of A2, A1 where it does not, and the scale never changed to save paper.
 */

import { describe, expect, it } from 'vitest';
import { PAC_RURAL_STEP_UP, generateDefaultSet, pacRuralSetTemplate, parseSetTemplate, serializeSetTemplate, type SetModel } from './index.js';

const NAMES = { name: 'PAC simplificat', plans: 'Planuri de nivel', facades: 'Fațade', sections: 'Secțiuni principale' };

/** A building `x` by `y` by `z` metres (y is the height) with a ground storey and one above. */
const building = (x: number, y: number, z: number): SetModel => ({
  projectName: 'House', storeys: [{ name: 'Ground', elevation: 0 }, { name: 'First', elevation: 3 }], extent: { min: { x: 0, y: 0, z: 0 }, max: { x, y, z } }, proposalInput: () => null,
});

const drawn = (m: SetModel) => {
  const made = generateDefaultSet(m, { setTemplate: pacRuralSetTemplate(NAMES), now: 0 })!;
  const named = made.document.sheets.filter((s) => s.name.startsWith(NAMES.plans) || s.name.startsWith(NAMES.facades) || s.name.startsWith(NAMES.sections));
  return { made, named };
};

describe('the paper rule of the rural PAC set', () => {
  it('a 12 x 8 m house, 7 m high: every drawing on its own A3 landscape sheet at 1:50', () => {
    // The A3 drawing area is 400 x 227 mm (10 mm frame, 50 mm title block), and a drawing needs 25 mm clear on each
    // side and 12 mm for its title: at 1:50 a plan or facade up to 8.25 m deep fits, whatever its width up to 17.5 m.
    const { named } = drawn(building(12, 7, 8));
    expect(named.map((s) => s.name)).toEqual(['Planuri de nivel 1', 'Planuri de nivel 2', 'Fațade 1', 'Fațade 2', 'Fațade 3', 'Fațade 4']);
    for (const s of named) {
      expect(s.paper, s.name).toBe('A3');
      expect(s.orientation, s.name).toBe('landscape');
      expect(s.viewports, s.name).toHaveLength(1);
      expect(s.viewports![0].scale, s.name).toBe(50);
    }
  });

  it('a 12 x 12 m plan is 240 mm at 1:50 but needs 302 mm with its clearances: it does not fit A3 (297 mm), so A2', () => {
    const plans = drawn(building(12, 7, 12)).named.filter((s) => s.name.startsWith(NAMES.plans));
    expect(plans.map((s) => [s.paper, s.viewports![0].scale])).toEqual([['A2', 50], ['A2', 50]]);
  });

  it('a larger building steps that sheet up to A2, then A1, and keeps 1:50', () => {
    // 25 m wide: 500 mm at 1:50, too wide for the A3 drawing area, fits A2 (594 mm paper).
    const wide = drawn(building(25, 7, 12)).named;
    expect(wide.map((s) => [s.name, s.paper, s.viewports![0].scale])).toEqual([
      ['Planuri de nivel 1', 'A2', 50], ['Planuri de nivel 2', 'A2', 50],
      ['Fațade 1', 'A2', 50], ['Fațade 2', 'A3', 50], ['Fațade 3', 'A2', 50], ['Fațade 4', 'A3', 50],
    ]);
    // 35 m wide: 700 mm at 1:50, needs A1 (841 mm paper).
    const wider = drawn(building(35, 7, 12)).named.filter((s) => s.name.startsWith(NAMES.plans));
    expect(wider.map((s) => [s.paper, s.viewports![0].scale])).toEqual([['A1', 50], ['A1', 50]]);
  });

  it('a drawing too large for A1 at 1:50 stays on A1 and is rescaled and said, not put on a larger paper', () => {
    const { made, named } = drawn(building(60, 7, 12));
    const plan = named.find((s) => s.name === 'Planuri de nivel 1')!;
    expect(plan.paper).toBe('A1');
    expect(plan.viewports![0].scale).toBeGreaterThan(50);
    expect(made.notes.some((n) => n.key === 'setTemplate.note.rescaled' && n.params.sheet === 'Planuri de nivel 1')).toBe(true);
  });

  it('is carried by the template file', () => {
    const template = pacRuralSetTemplate(NAMES);
    expect(template.sheets.every((s) => s.layout.paper === 'A3' && s.layout.stepUp?.join() === PAC_RURAL_STEP_UP.join())).toBe(true);
    const back = parseSetTemplate(serializeSetTemplate(template));
    expect(back.sheets.map((s) => s.layout.stepUp)).toEqual(template.sheets.map(() => ['A2', 'A1']));
  });
});
