/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #619: `ifcsheet build --dxf` and the app's sheet DXF for the same sheet of AC20-FZK-Haus. The CLI runs for real (`run(['build', ...])`, the
 * file it writes is read back); the app lays the default set out (`startDrawingSet`), draws A-101 (`SheetPaper` through `captureSheets`) and writes
 * it with `svgToDxf`. Both are DXF R2000, name their layers from the one CAD layer standard (`@bimvoice/ifcsheet/dxf`), and carry the same TEXT.
 * Two differences remain, both the app's own drawing and both explained below: the section and elevation reference marks on the plan
 * (drafts, on the drafting layer "0") and the drawing numbers in the rings before the view titles. A project's own CAD rules are held by the
 * engine's `sheet-dxf.test.ts`.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, run } from '@bimvoice/ifcsheet/cli';
import { setExtent } from '@/draft-set/body';
import { clearDraftHistory } from '@/drafting/draft-store';
import { captureSheets } from '@/issue/capture';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { useViewerStore } from '@/store';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';

/** One entity of a DXF text: its type, layer and TEXT value, read from the group codes. */
interface Entity { type: string; layer: string; value: string }
function entitiesOf(dxf: string): { version: string; entities: Entity[] } {
  const lines = dxf.split(/\r?\n/);
  const at = lines.findIndex((l, i) => l.trim() === '$ACADVER' && lines[i - 1]?.trim() === '9');
  const entities: Entity[] = [];
  const start = lines.findIndex((l, i) => l.trim() === 'ENTITIES' && lines[i - 1]?.trim() === '2');
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '0') continue;
    const type = lines[i + 1].trim();
    if (type === 'ENDSEC') break;
    let layer = '';
    let value = '';
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2) {
      if (lines[j].trim() === '8') layer = lines[j + 1];
      if (lines[j].trim() === '1') value = lines[j + 1];
    }
    entities.push({ type, layer, value });
  }
  return { version: lines[at + 2]?.trim() ?? '', entities };
}
const layersOf = (entities: readonly Entity[]) => [...new Set(entities.map((e) => e.layer))].sort();
const textsOf = (entities: readonly Entity[]) => entities.filter((e) => e.type === 'TEXT').map((e) => e.value).sort();

const WASM = new URL('../../../../../../packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
const skip = planModelMissing(FZK_HAUS) || (existsSync(WASM) ? false : 'the wasm bundle is not built: run `pnpm build:wasm:fetch`');

describe('A-101 of AC20-FZK-Haus: ifcsheet build --dxf and the app write the same DXF (#619)', { skip }, () => {
  let model: LoadedPlanModel;
  const dir = skip ? '' : mkdtempSync(join(tmpdir(), 'dxf-parity-'));
  before(async () => {
    model = await loadPlanModel(FZK_HAUS);
    const geometryResult = [...useViewerStore.getState().models.values()][0].geometryResult;
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  after(() => {
    publishDrawingRuntime(null);
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => resetProject());

  // happy-dom has no layout and does not map presentation attributes to computed style, which the DXF walker needs: a screen CTM (the identity: the sheet's units are
  // millimetres, only the layers and the text are compared here, not the places) and the stroke and fill an element's attributes give.
  const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
  const ownCtm = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
  const realStyle = window.getComputedStyle.bind(window);
  before(() => {
    proto.getScreenCTM = () => new DOMMatrix();
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => new Proxy(realStyle(el, pseudo), {
      get: (target, key) => (key === 'stroke' || key === 'fill' ? target[key] || el.getAttribute(key) || '' : Reflect.get(target, key) instanceof Function ? Reflect.get(target, key).bind(target) : Reflect.get(target, key)),
    })) as typeof window.getComputedStyle;
  });
  after(() => {
    window.getComputedStyle = realStyle;
    if (ownCtm) Object.defineProperty(proto, 'getScreenCTM', ownCtm); else delete proto.getScreenCTM;
  });

  /** The app's A-101, as the DXF button writes it. */
  async function appDxf(): Promise<string> {
    resetProject();
    clearDraftHistory();
    useViewDrawings.setState({ byView: {} });
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const meshes = [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(startDrawingSet(meshes, extent), 'the Wall lays out a set');
    for (const view of useProjectStore.getState().views) {
      if (view.kind === '3d') continue;
      const drawing = await model.planOf(view);
      useViewDrawings.setState((s) => ({ byView: { ...s.byView, [view.id]: { ...EMPTY_VIEW_DRAWING, drawing, status: 'ready' } } }));
    }
    const sheet = useProjectStore.getState().sheets.find((s) => s.number === 'A-101');
    assert.ok(sheet, `the set has an A-101 (${useProjectStore.getState().sheets.map((s) => s.number).join(', ')})`);
    const captured = await captureSheets([sheet], { dxf: true });
    assert.deepEqual(captured.failed, []);
    return Buffer.from(captured.dxfs.get(sheet.id) ?? []).toString('latin1');
  }

  /** `ifcsheet build FZK --dxf`: the file the CLI wrote for A-101. */
  async function cliDxf(): Promise<string> {
    const out = mkdtempSync(join(dir, 'run-'));
    const err: string[] = [];
    const code = await run(['build', FZK_HAUS, '--out', join(out, 'set.pdf'), '--dxf', join(out, 'dxf')], { stdout: () => undefined, stderr: (t) => void err.push(t) });
    assert.equal(code, EXIT.ok, err.join(''));
    return readFileSync(join(out, 'dxf', 'A-101.dxf')).toString('latin1');
  }

  it('write DXF R2000, the same layers and the same TEXT but the reference marks and the drawing numbers', async () => {
    const app = entitiesOf(await appDxf());
    const cli = entitiesOf(await cliDxf());
    assert.equal(app.version, 'AC1015');
    assert.equal(cli.version, 'AC1015');
    assert.ok(cli.entities.length > 100, `the CLI file holds the drawing (${cli.entities.length} entities)`);
    // The app's default A-101 also carries the plan's section and elevation reference marks (A, B, "1 / A-301", ...), drafted on the drafting layer
    // "0". The engine's sheet does not draw them yet: they are the TEXT and the lines that remain open in #619, so they are set aside here, said
    // aloud, and what is left must agree.
    const marks = app.entities.filter((e) => e.layer === '0');
    assert.ok(marks.every((e) => e.type === 'LINE' || e.type === 'TEXT'), 'the drafting layer holds only the reference marks (lines and their labels)');
    const drawn = app.entities.filter((e) => e.layer !== '0');
    assert.deepEqual(layersOf(cli.entities), layersOf(drawn));
    const appTexts = textsOf(drawn);
    const cliTexts = textsOf(cli.entities);
    assert.ok(cliTexts.length >= 18, `the CLI keeps the 18 TEXT values #624 wrote (${cliTexts.length})`);
    // The app draws each view's drawing number in a ring before its title (`TitleNumber`: "1", "2"); the engine's view title has no number yet.
    // Every other TEXT, the project name included, is the same on both sides.
    const rest = [...appTexts];
    for (const text of cliTexts) {
      const at = rest.indexOf(text);
      assert.ok(at >= 0, `the CLI writes "${text}" and the app does not`);
      rest.splice(at, 1);
    }
    assert.ok(rest.length > 0 && rest.every((t) => /^\d+$/.test(t)), `what only the app writes is the views' drawing numbers (${rest.join(', ')})`);
  });
});
