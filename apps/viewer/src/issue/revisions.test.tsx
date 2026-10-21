/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Revisions on the printed sheet (the SVG every export reads): the table lists the sheet's revisions in order,
 * the title block reads the latest, and an issue may leave the clouds of older revisions off the paper.
 */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shapePath } from '@/components/viewer/drafting/DraftOverlay';
import { resetProject, useProjectStore } from '@/project/project-store';
import { updateRevision } from '@/project/revision-actions';
import { REVISION_ID_PARAM } from '@/project/revisions';
import { useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { cloudDraft, ensureRevisionsLayer } from '@/whatchanged/cloud';
import { captureSheets } from './capture.js';

const BOX_A = { x0: 20, y0: 20, x1: 70, y1: 50 };
const BOX_B = { x0: 100, y0: 20, x1: 150, y1: 50 };
const MARK = { id: 'mark', viewId: 's101', layerId: '0', shape: { type: 'line', a: { x: 5, y: 5 }, b: { x: 9, y: 9 } }, params: {} } as never;
const sheet = (id: string, number: string, extra: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name: number, createdAt: 0, viewports: [], ...extra });
const RO = 'Pereți mutați, ștergere ușă: țevi ă';

function demoSet(): void {
  resetProject();
  useViewDrawings.setState({ byView: {} });
  useProjectStore.setState({
    sheets: [sheet('s101', 'A-101', { revisionIds: ['rev-a'] }), sheet('s201', 'A-201', { revisionIds: ['rev-a'] })],
    revisions: [
      { id: 'rev-a', code: 'A', date: '2026-09-01', description: 'Prima emitere', by: 'PC' },
      { id: 'rev-b', code: 'B', date: '2026-10-12', description: RO, by: 'IC' },
    ],
    drafts: [MARK, cloudDraft('s101', BOX_A, 1, { [REVISION_ID_PARAM]: 'rev-a' }), cloudDraft('s101', BOX_B, 1, { [REVISION_ID_PARAM]: 'rev-b' })],
    titleBlock: { project: 'Bloc P+4', date: '2026-10-12' },
  });
  ensureRevisionsLayer();
}

const svgTextOf = async (id: string, options: { currentCloudsOnly?: boolean } = {}): Promise<string> => {
  const out = await captureSheets(useProjectStore.getState().sheets.filter((s) => s.id === id), options);
  assert.deepEqual(out.failed, []);
  return out.svgs.get(id)!;
};
const svgOf = async (id: string, options: { currentCloudsOnly?: boolean } = {}): Promise<Document> =>
  new DOMParser().parseFromString(await svgTextOf(id, options), 'image/svg+xml');

const tableRows = (doc: Document): string[][] => {
  const cells = [...doc.querySelectorAll('[data-revision-table] text')].map((t) => t.textContent ?? '');
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));
  return rows;
};

/** What the title block prints under the label "Revision". */
const titleBlockRevision = (doc: Document): string | null => {
  const label = [...doc.querySelectorAll('text')].find((t) => t.textContent === 'Revision' && t.closest('[data-dxf-layer="TITLEBLOCK"]') !== null);
  return label?.nextElementSibling?.textContent ?? null;
};

const cloudPaths = (doc: Document): string[] => [...doc.querySelectorAll('path[data-dxf-layer="Revisions"]')].map((p) => p.getAttribute('d') ?? '');
const pathOf = (box: typeof BOX_A) => shapePath(cloudDraft('s', box, 1).shape as never, { scale: 1, x: 0, y: 0 }, 'down');

beforeEach(demoSet);

describe('the revision table and title block on the printed sheet', () => {
  it('A-101 lists A and B in order and its title block reads B, while A-201 lists A and reads A', async () => {
    const a101 = await svgOf('s101');
    assert.deepEqual(tableRows(a101).map((r) => r[0]), ['Rev.', 'A', 'B']);
    assert.equal(titleBlockRevision(a101), 'B');
    const a201 = await svgOf('s201');
    assert.deepEqual(tableRows(a201).map((r) => r[0]), ['Rev.', 'A']);
    assert.equal(titleBlockRevision(a201), 'A');
  });

  it('follow an edit of revision B\'s code to C, in the table and the title block', async () => {
    updateRevision('rev-b', { code: 'C' });
    const doc = await svgOf('s101');
    assert.deepEqual(tableRows(doc).map((r) => r[0]), ['Rev.', 'A', 'C']);
    assert.equal(titleBlockRevision(doc), 'C');
  });

  it('print a Romanian description exactly', async () => {
    assert.equal(tableRows(await svgOf('s101'))[2][2], RO);
    assert.ok((await svgTextOf('s101')).includes(`>${RO}</text>`));
  });

  it('draw no table and an empty revision for a sheet without revisions', async () => {
    useProjectStore.setState({ sheets: [sheet('s101', 'A-101')], drafts: [MARK] });
    const doc = await svgOf('s101');
    assert.equal(doc.querySelector('[data-revision-table]'), null);
    assert.equal(titleBlockRevision(doc), '');
  });
});

describe('issuing with only the current revision\'s clouds', () => {
  it('prints the clouds of A and B by default', async () => {
    assert.deepEqual(cloudPaths(await svgOf('s101')).sort(), [pathOf(BOX_A), pathOf(BOX_B)].sort());
  });

  it('prints B\'s cloud and not A\'s on A-101 with the option', async () => {
    assert.deepEqual(cloudPaths(await svgOf('s101', { currentCloudsOnly: true })), [pathOf(BOX_B)]);
  });

  it('keeps what is not a cloud of an older revision: the sheet\'s other lines, and a cloud with no revision', async () => {
    useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, cloudDraft('s101', { x0: 200, y0: 20, x1: 240, y1: 50 }, 1)] });
    const doc = await svgOf('s101', { currentCloudsOnly: true });
    assert.equal(cloudPaths(doc).length, 2);
  });
});
