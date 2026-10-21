/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The section symbol: drawing a section line on a plan leaves its symbol on
 * that plan (the line, a view arrow at each end, the section's name), tied to
 * the section view it created, and one undo step removes it again.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeProjectItem, renameProjectItem, resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { registerLocale, registerReadBackNames, setLocale } from '@/i18n/registry';
import { clearDraftHistory, undoDrafts } from './draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, setWorkPlaneProvider, startDraftCommand, useDraftingSession } from './session.js';
import { textBox } from './annotation.js';
import { nextSectionMark, sectionMarkOf, sectionSymbolShapes } from './section-symbol.js';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const TOL = 0.05;
const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
});

const drawSection = (y = 0): void => {
  startDraftCommand('sectionline');
  clickDrawing({ x: 0, y }, TOL, false);
  clickDrawing({ x: 10, y }, TOL, false);
  clickDrawing({ x: 5, y: y + 3 }, TOL, false);
};
const drafts = () => useProjectStore.getState().drafts;
const sections = () => useProjectStore.getState().views.filter((v) => v.kind === 'section');

describe('SECTION on a plan', () => {
  it('leaves the section symbol on the plan, linked to the new section view', () => {
    startDraftCommand('sectionline');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 10, y: 0 }, TOL, false);
    clickDrawing({ x: 5, y: 3 }, TOL, false);

    const { views, drafts } = useProjectStore.getState();
    const section = views.find((v) => v.kind === 'section');
    assert.ok(section, 'a section view is created');
    assert.ok(drafts.length > 0, 'the symbol stays drawn on the plan');
    assert.ok(drafts.every((d) => d.viewId === 'plan-1' && d.params.sectionOf === section?.id));
    assert.ok(drafts.some((d) => d.shape.type === 'line' && d.shape.a.x === 0 && d.shape.b.x === 10), 'the cut line itself is kept');
    assert.ok(drafts.some((d) => d.shape.type === 'text' && d.shape.text === 'A'), 'the section is marked at the line');
  });

  it('removes the symbol with one undo, so no orphan marker is left', () => {
    startDraftCommand('sectionline');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 10, y: 0 }, TOL, false);
    clickDrawing({ x: 5, y: 3 }, TOL, false);
    assert.ok(undoDrafts());
    assert.equal(useProjectStore.getState().drafts.length, 0);
  });
});

describe('sectionSymbolShapes', () => {
  it('sets each name clear of its arrowhead, on the stem line, whichever way the arrow points', () => {
    const h = 0.25;
    for (const side of [{ x: 5, y: 3 }, { x: 5, y: -3 }]) {
      const shapes = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 0 }, side, 'A', h);
      const dir = Math.sign(side.y);
      const tipY = dir * 4 * h;
      for (const text of shapes.filter((s) => s.type === 'text')) {
        if (text.type !== 'text') continue;
        const box = textBox(text.p, text.text, text.height, 0);
        const ys = box.map((c) => c.y);
        const nearEdge = dir > 0 ? Math.min(...ys) : Math.max(...ys);
        assert.ok(dir * (nearEdge - tipY) > 0.2 * h, 'the text box starts beyond the arrow tip');
        const cx = (Math.min(...box.map((c) => c.x)) + Math.max(...box.map((c) => c.x))) / 2;
        assert.ok(Math.abs(cx - 0) < 1e-9 || Math.abs(cx - 10) < 1e-9, 'centred on its stem');
      }
    }
  });

  it('points the view arrows at the picked side', () => {
    const shapes = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 }, 'S1', 0.25);
    const stems = shapes.filter((s) => s.type === 'line' && s.a.x === s.b.x);
    assert.equal(stems.length, 2, 'one stem per end, perpendicular to the line');
    for (const s of stems) {
      if (s.type !== 'line') continue;
      assert.ok(s.b.y > s.a.y, 'toward +y, the picked side');
      near(s.a.y, 0);
    }
    const flipped = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -3 }, 'S1', 0.25);
    assert.ok(flipped.some((s) => s.type === 'line' && s.a.x === s.b.x && s.b.y < s.a.y));
  });

  it('puts an arrowhead on each stem so the viewing direction reads at a glance', () => {
    const h = 0.25;
    const shapes = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 }, 'S1', h);
    const tipY = 4 * h;
    for (const x of [0, 10]) {
      const barbs = shapes.filter((s) => s.type === 'line' && s.a.x !== s.b.x && Math.abs(s.a.y - tipY) < 1e-9 && Math.abs(s.a.x - x) < 1e-9);
      assert.equal(barbs.length, 2, `two barbs leave the stem tip at x=${x}`);
      for (const s of barbs) {
        if (s.type !== 'line') continue;
        assert.ok(s.b.y < tipY, 'barbs sweep back toward the cut line');
      }
      const [p, q] = barbs.map((s) => (s.type === 'line' ? s.b.x - x : 0));
      near(p + q, 0); // symmetric about the stem
    }
  });
});

describe('section names', () => {
  it('names each new section A, B, C… at both ends and in the view name', () => {
    drawSection(0);
    drawSection(20);
    assert.deepEqual(sections().map((v) => v.name), ['Section A-A', 'Section B-B']);
    const marks = (viewId: string) => drafts().filter((d) => d.params.sectionOf === viewId && d.shape.type === 'text').map((d) => d.shape.type === 'text' ? d.shape.text : '');
    assert.deepEqual(marks(sections()[0].id), ['A', 'A']);
    assert.deepEqual(marks(sections()[1].id), ['B', 'B']);
  });

  it('reuses a mark freed by a deleted section, and runs on past Z', () => {
    const view = (name: string) => ({ name, kind: 'section' as const }) as Pick<ProjectView, 'name' | 'kind'>;
    assert.equal(nextSectionMark([view('Section A-A'), view('Section C-C')]), 'B');
    assert.equal(nextSectionMark([]), 'A');
    const all = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (c) => view(`Section ${c}-${c}`));
    assert.equal(nextSectionMark(all), 'AA');
    assert.equal(sectionMarkOf('Section B-B'), 'B');
    assert.equal(sectionMarkOf('North cut'), 'North cut');
  });

  it('shows a renamed section on its symbol', () => {
    drawSection();
    const id = sections()[0].id;
    renameProjectItem(id, 'Section K-K');
    assert.ok(drafts().filter((d) => d.shape.type === 'text').every((d) => d.shape.type === 'text' && d.shape.text === 'K'));
    renameProjectItem(id, 'Stair cut');
    assert.ok(drafts().filter((d) => d.shape.type === 'text').every((d) => d.shape.type === 'text' && d.shape.text === 'Stair cut'));
  });

  it('removes the symbol when its section view is deleted', () => {
    drawSection();
    drawSection(20);
    removeProjectItem(sections()[0].id);
    assert.ok(drafts().length > 0);
    assert.ok(drafts().every((d) => d.params.sectionOf === sections()[0].id));
  });
});

/**
 * PR #124 review: the section word comes from every catalogue's
 * `names.view.section`, so a new language needs no edit here for
 * `nextSectionMark` to keep a mark already used under it.
 */
describe('Section marks in any language', () => {
  const view = (name: string) => ({ name, kind: 'section' as const }) as Pick<ProjectView, 'name' | 'kind'>;
  afterEach(() => {
    setLocale('en');
    registerLocale('x-fake', {});
  });

  it('reads the mark of a section named under a third registered locale', () => {
    registerLocale('x-fake', { 'names.view.section': 'Sch.nitt {mark}-{mark}' });
    assert.equal(sectionMarkOf('Sch.nitt B-B'), 'B');
    assert.equal(nextSectionMark([view('Sch.nitt A-A'), view('Sch.nitt B-B'), view('Section C-C')]), 'D');
    // The word is matched literally: `.` is not a regex wildcard.
    assert.equal(sectionMarkOf('SchXnitt B-B'), 'SchXnitt B-B');
  });

  it('reads it from a shipped language whose catalogue never loaded', () => {
    registerReadBackNames({ 'names.view.section': 'Przekrój {mark}-{mark}' });
    assert.equal(nextSectionMark([view('Przekrój A-A')]), 'B');
  });
});
