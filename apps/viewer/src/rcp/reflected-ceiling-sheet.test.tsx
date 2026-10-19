/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A reflected ceiling plan is a view like any other (#91): it round-trips through the project file, a sheet
 * carries it, and the sheet exports as SVG and DXF. The drawing is the real one, generated from the fixture.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { EMPTY_PROJECT, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import type { PlanProjectView, ProjectSheet, SheetViewport } from '@/project/types';
import { patchViewDrawing, planeKey, viewDisplayOverrides } from '@/project/view-drawings';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { sectionPlaneForView } from '@/project/view-plane';
import { SheetCanvas } from '@/components/viewer/wall/SheetCanvas.js';
import { sheetDxf } from '@/components/viewer/sheets/sheet-dxf';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { useSheetContent } from '@/components/viewer/sheets/useSheetContent.js';
import { generateRcpView, RCP_FIXTURE } from '@/test/rcp-fixture';

const level = { name: 'Level 1', elevation: RCP_FIXTURE.storeyZ, storeyGlobalIds: [] };
const base = { name: 'Level 1 ceiling', createdAt: 0, scale: 50 };
const rcp: PlanProjectView = { ...base, id: 'rcp', kind: 'plan', level, cutHeight: 1.2, reflected: true };
const plan: PlanProjectView = { ...base, id: 'plan', kind: 'plan', level, cutHeight: 1.2 };
const vp: SheetViewport = { id: 'vp', viewId: 'rcp', x: 300, y: 200, scale: 50, width: 0, height: 0, center: null };
const bounds = { min: { x: -4.1, y: 2.9, z: -6.1 }, max: { x: 4.1, y: 5.8, z: 0.1 } };

describe('reflected ceiling plan as a view', () => {
  it('is a plan that looks up: its plane keeps x/y, its key differs from the floor plan, a floor plan has no flag', () => {
    const up = sectionPlaneForView(rcp, bounds, [level]);
    const down = sectionPlaneForView(plan, bounds, [level]);
    assert.ok(up && down);
    assert.equal(up.reflected, true);
    assert.equal(up.flipped, false, 'never a mirror');
    assert.equal(down.reflected, undefined);
    assert.notEqual(planeKey(up), planeKey(down));
    assert.equal(up.position, down.position, 'same cut height');
    assert.equal(viewPlaneConfig(rcp, [level], bounds)?.reflected, true);
    assert.equal(viewPlaneConfig(plan, [level], bounds)?.reflected, undefined);
  });

  it('sees all that is above its cut, not down to the floor like a plan', () => {
    assert.deepEqual(viewDisplayOverrides(rcp), { showConstructionProjection: true, constructionProjectionDepth: null });
    assert.deepEqual(viewDisplayOverrides(plan), { showConstructionProjection: true, constructionProjectionDepth: 1.2 });
  });

  it('round-trips through the project file', () => {
    const doc = { ...EMPTY_PROJECT, views: [plan, rcp] };
    const back = parseProjectFile(serializeProject(doc)).views as PlanProjectView[];
    assert.equal(back[1].reflected, true);
    assert.equal(back[0].reflected, undefined);
  });
});

describe('reflected ceiling plan on a sheet', () => {
  beforeEach(() => resetProject());
  afterEach(() => cleanup());

  it('exports as SVG and DXF', async () => {
    const drawing = await generateRcpView(rcp);
    const sheet: ProjectSheet = { id: 's', number: 'A-201', name: 'Ceiling plans', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports: [vp] };
    useProjectStore.setState({ views: [rcp], sheets: [sheet] });
    patchViewDrawing('rcp', { drawing, status: 'ready' });
    function Harness() {
      const content = useSheetContent(useProjectStore((s) => s.sheets[0]));
      return <SheetCanvas sheet={useProjectStore.getState().sheets[0]} sheetContent={content} chosenId={null} onChoose={() => {}} onOpen={() => {}} onNudge={() => {}} fitKey={0} />;
    }
    const ui = render(<Harness />);
    const svg = ui.querySelector('svg');
    assert.ok(svg, 'the sheet renders');
    const text = sheetSvgText(svg as unknown as SVGSVGElement, sheet);
    assert.match(text, /^<\?xml/);
    // At 1:50 with the viewport centred on the drawing (4.0, -3.0) at (300, 200) mm: model (6.0, 1.2) is at
    // sheet (340, 236) mm, the light's 0.6 m square spans 334..346 x 230..242, drawn solid (the SEEN layer);
    // the ceiling's notch edge x = 4.0 is at 300 mm, running from y = 2.5 to 5.9 (142..210 mm).
    const seen = text.match(/data-dxf-layer="SEEN"[^>]* d="([^"]*)"/)?.[1] ?? '';
    assert.ok(seen.includes('M334.00 230.00L346.00 230.00'), 'the light sits at its model x/y on the sheet');
    assert.ok(seen.includes('M300.00 142.00L300.00 210.00'), 'the ceiling edge sits at its model x/y on the sheet');
    const dxf = new TextDecoder().decode(sheetDxf(svg as unknown as SVGSVGElement, sheet));
    // happy-dom has no getScreenCTM, so the DXF here is the empty document: this is a smoke test that it writes.
    assert.ok(dxf.includes('EOF'), 'a DXF document');
  });
});
