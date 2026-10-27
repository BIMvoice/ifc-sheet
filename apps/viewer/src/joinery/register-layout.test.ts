/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRegister, layoutRegisterPage, registerFit, type RegisterLabels } from './register-layout';
import { PAD } from '@bimvoice/ifcsheet';
import type { RegisterRow } from '@/project/drawing-register';

const labels: RegisterLabels = { title: 'Drawing register', number: 'No.', sheetTitle: 'Title', scale: 'Scale', revision: 'Rev.', date: 'Date' };
const rows: RegisterRow[] = Array.from({ length: 4 }, (_, i) => ({ number: `A-10${i}`, title: `Plan ${i}`, scale: '1:50', revision: 'A', date: '2026-01-01' }));

describe('the drawing register keeps its text inside the viewport clip (#42)', () => {
  for (const scale of [1, 0.8]) {
    it(`at ${scale} x: the title and every cell start at least a cell padding from the left edge`, () => {
      const l = layoutRegister(rows, labels, scale);
      const runs = l.prims.flatMap((p) => (p.kind === 'text' ? [p] : []));
      assert.ok(runs.some((r) => r.text === labels.title), 'the title is on the sheet');
      for (const r of runs) assert.ok(r.x >= PAD * scale - 1e-9, `"${r.text}" starts at ${r.x}, left of the inset ${PAD * scale}`);
    });
  }

  it('a continuation page insets its title too', () => {
    const fit = registerFit(40, 120);
    const l = layoutRegisterPage(Array.from({ length: 40 }, (_, i) => ({ ...rows[0], number: `A-${i}` })), labels, fit, 1);
    const title = l.prims.find((p) => p.kind === 'text' && p.text.startsWith(labels.title));
    assert.ok(title && title.kind === 'text' && title.x >= PAD * fit.scale - 1e-9);
  });
});
