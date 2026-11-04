/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The "Star on GitHub" link and the one reminder after the first issued set (#655): the link's address and text
 * in both languages, the reminder in the real issue form (shown once after a good issue, not after a failure, not
 * again once closed or followed, no crash when the store is blocked), and no star text on a sheet's output.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { STAR_URL } from '@/lib/star';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { sheetSvgText } from './sheet-export';
import { SheetPaper } from './SheetPaper';
import { IfcSheetShell } from '../ifcsheet/IfcSheetShell.js';
import { IssueForm } from './IssueForm';
import { WALL_SKIN } from './set-skin';

const WALL = [{ x: -2, y: -0.15 }, { x: 2, y: -0.15 }, { x: 2, y: 0.15 }, { x: -2, y: 0.15 }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 10, includeHiddenLines: true, creaseAngle: 30, scale: 100 },
  lines: WALL.map((a, i) => ({ line: { start: a, end: WALL[(i + 1) % 4] }, category: 'cut', visibility: 'visible', entityId: 7, ifcType: 'IfcWall', modelIndex: 0, depth: 0 })),
  cutPolygons: [{ polygon: { outer: WALL, holes: [] }, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: -2, y: -0.15 }, max: { x: 2, y: 0.15 } },
  stats: { cutLineCount: 4, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;

/** A project with one sheet that issues, or none (an issue of nothing is not an issued set). */
function project(withSheet: boolean): void {
  resetProject();
  if (!withSheet) return;
  const view = addProjectView({ kind: 'plan', name: 'One', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
  useViewDrawings.setState({ byView: { [view]: { ...EMPTY_VIEW_DRAWING, drawing: DRAWING, status: 'ready' } } });
  const vp = { id: 'p1', viewId: view, x: 100, y: 100, scale: 100, width: 150, height: 60, center: null };
  useProjectStore.setState({ name: 'Casa', sheets: [{ id: 's1', number: 'A-101', name: 'Ground', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [vp] } as unknown as ProjectSheet] });
}

const reminder = (root: HTMLElement) => root.querySelector('[data-testid="star-reminder"]');
/** Click "SVG, zipped" (or its Romanian) and wait until the issue has finished and the button is free again. */
const issueSvg = async (root: HTMLElement, label = 'SVG, zipped') => {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent === label)!;
  click(button);
  assert.equal(button.disabled, true, 'the issue is running');
  await waitFor(() => !button.disabled, 'the issue never finished');
};

const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const blockStorage = () => Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
const originalWarn = console.warn;

beforeEach(() => { registerLocale('ro', ro); localStorage.clear(); console.warn = () => {}; });
afterEach(() => {
  cleanup();
  console.warn = originalWarn;
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  act(() => setLocale('en'));
  resetProject();
});

describe('the Star on GitHub link (#655)', () => {
  for (const [locale, label] of [['en', '★ Star on GitHub'], ['ro', '★ Dați o stea pe GitHub']] as const) {
    it(`is on the face in ${locale}, to the project page, in a new tab`, () => {
      act(() => setLocale(locale));
      project(false);
      const link = render(<IfcSheetShell />).querySelector<HTMLAnchorElement>(`a[href="${STAR_URL}"]`);
      assert.ok(link, 'the link is on the face');
      assert.equal(STAR_URL, 'https://github.com/BIMvoice/ifc-sheet');
      assert.equal(link.textContent, label);
      assert.equal(link.getAttribute('target'), '_blank');
      assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    });
  }

  it('is not part of a sheet\'s output', () => {
    project(false);
    const sheet: ProjectSheet = { id: 's1', number: 'A-101', autoNumber: false, name: 'A-101', createdAt: 1, paper: 'A1', orientation: 'landscape', viewports: [] };
    const ui = render(<SheetPaper sheet={sheet} projectName="Untitled" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: undefined, drawing: null, drafts: [] })} />);
    const svg = ui.querySelector('svg');
    assert.ok(svg, 'the sheet draws');
    assert.doesNotMatch(sheetSvgText(svg as unknown as SVGSVGElement, sheet), /star|github/i);
  });
});

describe('the one star reminder after the first issued set (#655)', () => {
  it('appears after a successful first issue, inline, with the link and a close button', async () => {
    project(true);
    const root = render(<IssueForm skin={WALL_SKIN} />);
    assert.equal(reminder(root), null, 'not before an issue');
    await issueSvg(root);
    const card = reminder(root)!;
    assert.match(card.textContent ?? '', /If IfcSheet saved you time, a star on GitHub helps others find it\./);
    const link = card.querySelector('a')!;
    assert.equal(link.getAttribute('href'), STAR_URL);
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(card.closest('[role="dialog"]'), null, 'never a modal');
  });

  it('does not appear after an issue that did not go out', async () => {
    project(false);
    const root = render(<IssueForm skin={WALL_SKIN} />);
    await issueSvg(root);
    assert.equal(reminder(root), null);
    assert.equal(localStorage.getItem('ifcsheet.starReminderShown'), null, 'a failure does not use up the reminder');
  });

  it('ends for good when closed: not on the next issue', async () => {
    project(true);
    const root = render(<IssueForm skin={WALL_SKIN} />);
    await issueSvg(root);
    click(reminder(root)!.querySelector('button')!);
    assert.equal(reminder(root), null);
    await issueSvg(root);
    assert.equal(reminder(root), null);
  });

  it('ends for good when the link is followed', async () => {
    project(true);
    const root = render(<IssueForm skin={WALL_SKIN} />);
    await issueSvg(root);
    // The page must not really navigate to github.com under test.
    document.addEventListener('click', (e) => e.preventDefault(), { once: true });
    click(reminder(root)!.querySelector('a')!);
    assert.equal(reminder(root), null);
    const again = render(<IssueForm skin={WALL_SKIN} />);
    await issueSvg(again);
    assert.equal(reminder(again), null, 'not in a new mount either: the flag is kept');
  });

  it('is not shown when the flag is already set', async () => {
    localStorage.setItem('ifcsheet.starReminderShown', '1');
    project(true);
    const root = render(<IssueForm skin={WALL_SKIN} />);
    await issueSvg(root);
    assert.equal(reminder(root), null);
  });

  it('does not throw, and shows nothing, when local storage is blocked', async () => {
    blockStorage();
    project(true);
    const root = render(<IssueForm skin={WALL_SKIN} />);
    await issueSvg(root);
    assert.equal(reminder(root), null);
    assert.ok([...root.querySelectorAll('p')].some((p) => /\S/.test(p.textContent ?? '')), 'the issue itself still reports');
  });

  it('is in Romanian', async () => {
    act(() => setLocale('ro'));
    project(true);
    const root = render(<IssueForm skin={WALL_SKIN} />);
    await issueSvg(root, 'SVG, arhivat');
    assert.match(reminder(root)!.textContent ?? '', /Dacă IfcSheet v-a economisit timp/);
  });
});
