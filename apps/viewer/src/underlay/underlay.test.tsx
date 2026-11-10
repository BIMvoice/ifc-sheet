/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { deflateSync, crc32 } from 'node:zlib';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory, editDrafts, newDraft } from '@/drafting/draft-store.js';
import { drawingToScreen, screenToDrawing, type ViewTransform } from '@/drafting/frame';
import { draftCommandByName } from '@/drafting/commands/registry.js';
import type { DraftContext } from '@/drafting/commands/types';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetDxf } from '@/components/viewer/sheets/sheet-dxf';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { addUnderlay, scaleUnderlay, setUnderlayLocked, setUnderlayPrintsOn } from './underlay-actions';
import { dataUrl, renderWithinCap, UnderlayImportError, type Rendered } from './underlay-import';
import { readUnderlay } from './underlay-file';
import { matrixText, omittedUnderlayViewNames, pixelToDrawing, drawingToPixel, UNDERLAY_MAX_BYTES, type ViewUnderlay } from './underlay';

/**
 * #457: a scanned page laid under a plan, scaled from a known 5 m dimension to within 0.5 %, traced with lines, and
 * printed on the sheets the person chose and on no other.
 */

// A scan: white paper, one black horizontal line 1200 px long. On the drawing it is a 5 m dimension.
const W = 1600;
const H = 1000;
const LINE = { y: 500, x0: 200, x1: 1400 };

function pngOf(width: number, height: number, black: (x: number, y: number) => boolean): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) if (black(x, y)) raw.fill(0, y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const scan = pngOf(W, H, (x, y) => Math.abs(y - LINE.y) <= 1 && x >= LINE.x0 && x <= LINE.x1);
const href = dataUrl(scan, 'image/png');

/** The ends of the dark line, found in the pixels the way a person finds them on screen. */
function lineEnds(): { a: { x: number; y: number }; b: { x: number; y: number } } {
  return { a: { x: LINE.x0, y: LINE.y + 0.5 }, b: { x: LINE.x1 + 1, y: LINE.y + 0.5 } };
}

const view = { id: 'plan-1', kind: 'plan', name: 'Ground floor', scale: 100 } as unknown as ProjectView;
const sheetA: ProjectSheet = { id: 'sheet-a', number: 'A-101', name: 'Plans', createdAt: 0, viewports: [{ id: 'vp-a', viewId: 'plan-1', x: 200, y: 150, scale: 100, width: 300, height: 200, center: { x: 0, y: 0 } }] };
const sheetB: ProjectSheet = { ...sheetA, id: 'sheet-b', number: 'A-102', viewports: [{ ...sheetA.viewports![0]!, id: 'vp-b' }] };

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(() => { cleanup(); resetProject(); });

function place(): string {
  // The page lands at 96 dpi, which is not the scale of the drawing it was printed at.
  return addUnderlay({ viewId: view.id, name: 'scan.png', kind: 'image', href, widthPx: W, heightPx: H, mPerPx: 0.0254 / 96 * 3 });
}

const get = (id: string): ViewUnderlay => {
  const u = useProjectStore.getState().underlays?.find((o) => o.id === id);
  assert.ok(u);
  return u;
};

const sheetSvg = (sheet: ProjectSheet) => {
  const ui = render(<SheetPaper sheet={sheet} projectName="House" content={() => ({ view, drawing: null, drafts: [] })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  const live = ui.querySelector('svg');
  assert.ok(live);
  return live as unknown as SVGSVGElement;
};

describe('an underlay scaled from a known distance (#457)', () => {
  it('the 5 m dimension on the scan is 5 m after UNDERLAYSCALE, within 0.5 %, from picks at screen pixels', () => {
    const id = place();
    const ends = lineEnds();
    // The person zooms until the line is about 800 screen pixels long and clicks its ends, whole pixels.
    const view2d: ViewTransform = { scale: 270, x: 400, y: 300 };
    const before = get(id);
    const toScreen = (p: { x: number; y: number }) => {
      const s = drawingToScreen(pixelToDrawing(before, p), view2d, 'down');
      return { x: Math.round(s.x), y: Math.round(s.y) };
    };
    const pickA = screenToDrawing(toScreen(ends.a), view2d, 'down');
    const pickB = screenToDrawing(toScreen(ends.b), view2d, 'down');
    const said: string[] = [];
    const command = draftCommandByName('UNDERLAYSCALE')!.create({ viewId: view.id, say: (key: string) => said.push(key) } as unknown as DraftContext);
    assert.equal(command.wantsValue?.(), false);
    command.onPoint?.(pickA);
    command.onPoint?.(pickB);
    assert.equal(command.wantsValue?.(), true);
    assert.equal(command.onValue?.(5), 'done');
    assert.deepEqual(said, ['drafting.msg.underlayScaled']);

    const after = get(id);
    const [pa, pb] = [pixelToDrawing(after, ends.a), pixelToDrawing(after, ends.b)];
    const length = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    assert.ok(Math.abs(length - 5) / 5 < 0.005, `the dimension reads ${length} m, wanted 5 m within 0.5 %`);
    // The first pick stays where it was clicked.
    const kept = pixelToDrawing(after, drawingToPixel(before, pickA));
    assert.ok(Math.hypot(kept.x - pickA.x, kept.y - pickA.y) < 1e-9);
  });

  it('can be traced: a drafted line over the scan lies on its line and is 5 m long within 0.5 %', () => {
    const id = place();
    const ends = lineEnds();
    assert.ok(scaleUnderlay(id, pixelToDrawing(get(id), ends.a), pixelToDrawing(get(id), ends.b), 5));
    const u = get(id);
    const a = pixelToDrawing(u, ends.a);
    const b = pixelToDrawing(u, ends.b);
    editDrafts({ add: [newDraft(view.id, '0', { type: 'line', a, b })] });
    const drafted = useProjectStore.getState().drafts.find((d) => d.viewId === view.id);
    assert.ok(drafted && drafted.shape.type === 'line');
    const { a: da, b: db } = drafted.shape;
    assert.ok(Math.abs(Math.hypot(db.x - da.x, db.y - da.y) - 5) / 5 < 0.005);
    const pa = drawingToPixel(u, da);
    const pb = drawingToPixel(u, db);
    assert.ok(Math.hypot(pa.x - ends.a.x, pa.y - ends.a.y) < 0.5 && Math.hypot(pb.x - ends.b.x, pb.y - ends.b.y) < 0.5, 'the line sits on the scanned line');
  });

  it('a locked underlay keeps its scale and position', () => {
    const id = place();
    const before = get(id);
    setUnderlayLocked(id, true);
    assert.equal(scaleUnderlay(id, { x: 0, y: 0 }, { x: 1, y: 0 }, 5), false);
    assert.deepEqual({ ...get(id), locked: false }, before);
    const said: string[] = [];
    const command = draftCommandByName('ULSCALE')!.create({ viewId: view.id, say: (key: string) => said.push(key) } as unknown as DraftContext);
    command.onPoint?.({ x: 0, y: 0 });
    assert.deepEqual(said, ['drafting.msg.underlayLocked']);
  });

  it('refuses a distance that is not above zero', () => {
    const id = place();
    assert.equal(scaleUnderlay(id, { x: 0, y: 0 }, { x: 1, y: 0 }, 0), false);
    assert.equal(scaleUnderlay(id, { x: 0, y: 0 }, { x: 0, y: 0 }, 5), false);
    assert.equal(scaleUnderlay(id, { x: 0, y: 0 }, { x: 1, y: 0 }, Number.NaN), false);
  });
});

describe('what a sheet prints of an underlay (#457)', () => {
  const imagesOf = (sheet: ProjectSheet) => Array.from(sheetSvg(sheet).querySelectorAll('image[data-underlay-id]'));

  it('prints on the sheets chosen and on no other, at true scale', () => {
    const id = place();
    const ends = lineEnds();
    scaleUnderlay(id, pixelToDrawing(get(id), ends.a), pixelToDrawing(get(id), ends.b), 5);
    assert.equal(imagesOf(sheetA).length, 0, 'not printed until chosen');

    setUnderlayPrintsOn(id, sheetA.id, true);
    const shown = imagesOf(sheetA);
    assert.equal(shown.length, 1);
    assert.equal(imagesOf(sheetB).length, 0, 'the other sheet did not choose it');
    assert.equal(shown[0]!.getAttribute('href'), href);

    // 5 m at 1:100 is 50 mm on the paper: the line is 1200 of the picture's pixels.
    const m = /matrix\(([^)]*)\)/.exec(shown[0]!.getAttribute('transform') ?? '');
    assert.ok(m);
    const [a, b] = m[1]!.split(/[ ,]+/).map(Number) as [number, number];
    const mmPerPx = Math.hypot(a, b);
    assert.ok(Math.abs(1200 * mmPerPx - 50) / 50 < 0.005, `${1200 * mmPerPx} mm on the paper, wanted 50`);
    // The same document is what the PDF print and the SVG export carry.
    assert.match(sheetSvgText(sheetSvg(sheetA), sheetA), /data-underlay-id/);

    setUnderlayPrintsOn(id, sheetA.id, false);
    assert.equal(imagesOf(sheetA).length, 0, 'hidden again');
    assert.equal(get(id).printOnSheets, undefined);
  });

  it('is left out of the DXF, and the sheet export says which views it came from', () => {
    const id = place();
    setUnderlayPrintsOn(id, sheetA.id, true);
    const state = useProjectStore.getState();
    assert.deepEqual(omittedUnderlayViewNames(sheetA, [{ id: view.id, name: view.name }], state.underlays), ['Ground floor']);
    assert.deepEqual(omittedUnderlayViewNames(sheetB, [{ id: view.id, name: view.name }], state.underlays), []);
    const dxf = new TextDecoder().decode(sheetDxf(sheetSvg(sheetA), sheetA));
    assert.doesNotMatch(dxf, /IMAGE/);
  });

  it('opacity zero prints nothing', () => {
    const id = place();
    setUnderlayPrintsOn(id, sheetA.id, true);
    useProjectStore.setState({ underlays: [{ ...get(id), opacity: 0 }] });
    assert.equal(imagesOf(sheetA).length, 0);
  });
});

describe('the size cap (#457)', () => {
  const rendered = (side: number): Rendered => ({ bytes: new Uint8Array(side), mime: 'image/png', widthPx: side, heightPx: side, mPerPx: 1 });

  it('renders smaller, a quarter off the side at a time, until the bytes fit', async () => {
    const sides: number[] = [];
    const out = await renderWithinCap(async (side) => { sides.push(side); return rendered(side); }, 1500);
    assert.deepEqual(sides, [3000, 2250, 1687, 1265]);
    assert.equal(out.widthPx, 1265);
  });

  it('refuses a picture that does not fit even reduced', async () => {
    await assert.rejects(renderWithinCap(async (side) => rendered(side), 100), (e) => e instanceof UnderlayImportError && e.code === 'too-large');
  });

  it('the cap is 2 MB, and the project file reader refuses a bitmap over it or one that is not a picture', () => {
    assert.equal(UNDERLAY_MAX_BYTES, 2 * 1024 * 1024);
    const good = { id: 'u', viewId: 'v', href, widthPx: 2, heightPx: 2, at: { x: 0, y: 0 }, mPerPx: 0.1 };
    assert.equal(readUnderlay(good, '/u').opacity, 0.5);
    assert.throws(() => readUnderlay({ ...good, href: 'https://example.com/scan.png' }, '/u'));
    assert.throws(() => readUnderlay({ ...good, href: `data:image/png;base64,${'A'.repeat(Math.ceil(UNDERLAY_MAX_BYTES * 4 / 3) + 100)}` }, '/u'));
    assert.throws(() => readUnderlay({ ...good, mPerPx: 0 }, '/u'));
  });
});

describe('#457 the matrix text (found in a real browser)', () => {
  it('is comma separated, as CSS needs for the on-screen layer; the space form is dropped by the browser and the picture is drawn untransformed', () => {
    assert.equal(matrixText([0.5, 0, 0, -0.5, 12.25, 3]), 'matrix(0.5, 0, 0, -0.5, 12.25, 3)');
    // A pixel on a sheet is about 0.001 mm: kept to nine decimals, not six.
    assert.equal(matrixText([0.000792, 0, 0, 0.000792, 1, 2]), 'matrix(0.000792, 0, 0, 0.000792, 1, 2)');
  });
});
