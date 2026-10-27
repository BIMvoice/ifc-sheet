/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Door symbols from the operation the IFC states (#486, second part). One IFC written here, one door per IfcDoorTypeOperationEnum value, goes
 * through the engine's reads, the plan symbols, the elevation's opening lines and the DXF, so a door the model says slides, folds, revolves or
 * swings both ways is drawn as that, on the side the model says, on the plan, the elevation and in the export.
 */

import '@/test/setup-dom.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { useViewerStore } from '@/store';
import { worldToDrawing } from '@/drafting/frame';
import type { DraftShape, Pt } from '@/drafting/types';
import { resetProject, useProjectStore } from './project-store.js';
import { symbolOverlays } from './plan-overlays.js';
import { viewElevationSymbols, viewOpeningSymbols } from './view-symbols.js';
import { viewDxf } from '@/components/viewer/drafting/view-dxf';
import type { ProjectView } from './types.js';

const OPERATIONS = [
  'SINGLE_SWING_LEFT', 'DOUBLE_SWING_LEFT', 'DOUBLE_SWING_RIGHT', 'SLIDING_TO_LEFT', 'SLIDING_TO_RIGHT', 'DOUBLE_DOOR_SLIDING',
  'FOLDING_TO_LEFT', 'FOLDING_TO_RIGHT', 'DOUBLE_DOOR_FOLDING', 'REVOLVING',
] as const;
type Operation = (typeof OPERATIONS)[number];
/** A door's express id: its operation's place in the list. */
const ID = (op: Operation) => 40 + OPERATIONS.indexOf(op);
const GUID = (id: number) => `0000000000000000000${String(id).padStart(3, '0')}`;

const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('doors'),'2;1');
FILE_NAME('d.ifc','2026-10-27T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCPROJECT('0000000000000000000001',$,'P',$,$,$,$,$,#2);
${OPERATIONS.map((op) => `#${ID(op)}=IFCDOOR('${GUID(ID(op))}',$,'D',$,$,$,$,'D',2.1,0.9,.DOOR.,.${op}.,$);`).join('\n')}
ENDSEC;
END-ISO-10303-21;
`;

const PLAN: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
/** An elevation of the door's two faces: looking from renderer +Z (the placement's -Y side) or from -Z (its +Y side, the one it opens to). */
const ELEVATION = (flipped: boolean): SectionPlaneConfig => ({ axis: 'z', position: 0, flipped });

/** A 0.9 x 2.1 x 0.06 door at (5, 1.05, 2) placed with IFC X along renderer +X and IFC Y along renderer -Z; `mirror`: X reversed (negative determinant). */
function door(expressId: number, mirror = false): MeshData {
  const pts: number[] = [];
  for (const x of [-0.45, 0.45]) for (const y of [-1.05, 1.05]) for (const z of [-0.03, 0.03]) pts.push(x, y, z);
  return { expressId, ifcType: 'IfcDoor', positions: new Float32Array(pts), origin: [5, 1.05, 2], localToWorld: [mirror ? -1 : 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as unknown as MeshData;
}

const bounds = (shapes: readonly DraftShape[]) => {
  const pts: Pt[] = shapes.flatMap((s) => (s.type === 'line' ? [s.a, s.b] : s.type === 'polyline' ? s.pts : s.type === 'circle' ? [{ x: s.c.x - s.r, y: s.c.y }, { x: s.c.x + s.r, y: s.c.y }] : [s.c]));
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
};
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} against ${b}`);

describe('door symbols from the operation the model states (#486)', () => {
  before(async () => {
    const { dataStore } = await openModel(new TextEncoder().encode(IFC), { geometry: false });
    useViewerStore.setState({
      models: new Map([['m', { ifcDataStore: dataStore } as never]]),
      resolveGlobalIdFromModels: (id: number) => (OPERATIONS.some((op) => ID(op) === id) ? { modelId: 'm', expressId: id } : null),
    } as never);
  });
  beforeEach(() => resetProject());

  const plan = (op: Operation, mirror = false) => {
    const [symbol] = viewOpeningSymbols([door(ID(op), mirror)], PLAN, undefined, new Set());
    return { thin: symbol.shapes, heavy: symbol.heavy ?? [], dashed: symbol.dashed ?? [] };
  };

  describe('on the plan', () => {
    // Plan frame here: drawing x = renderer x, drawing y = renderer z, so a placement's +Y (renderer -Z) is the drawing's -y.
    it('SLIDING_TO_LEFT / RIGHT: a leaf bar along the wall face and an arrow along the wall towards that side, the other way mirrored', () => {
      for (const [op, towards] of [['SLIDING_TO_LEFT', -1], ['SLIDING_TO_RIGHT', 1]] as const) {
        for (const mirror of [false, true]) {
          const { thin, heavy, dashed } = plan(op, mirror);
          assert.equal(heavy.length, 1, `${op}: one leaf`);
          assert.equal(dashed.length, 0);
          assert.equal(thin.filter((s) => s.type === 'arc').length, 0, `${op} draws no swing arc`);
          const bar = bounds(heavy);
          near(bar.x1 - bar.x0, 0.9, `${op} bar length`);
          const shaft = thin.find((s) => s.type === 'line');
          assert.ok(shaft && shaft.type === 'line', `${op}: an arrow`);
          near(shaft.a.y, shaft.b.y, `${op}: the arrow runs along the wall`);
          const sign = towards * (mirror ? -1 : 1);
          assert.equal(Math.sign(shaft.b.x - shaft.a.x), sign, `${op}${mirror ? ' mirrored' : ''}: arrow direction`);
          // The leaf lies on the +Y side of the opening, with the arrow beyond it.
          assert.ok(shaft.a.y < bar.y0, `${op}: the arrow lies beyond the leaf`);
        }
      }
    });

    it('DOUBLE_DOOR_SLIDING: two leaves, arrows apart', () => {
      const { heavy, thin } = plan('DOUBLE_DOOR_SLIDING');
      assert.equal(heavy.length, 2);
      const lengths = heavy.map((s) => bounds([s])).map((b) => b.x1 - b.x0);
      lengths.forEach((l) => near(l, 0.45, 'each leaf covers half the opening'));
      const arrows = thin.filter((s) => s.type === 'line').map((s) => (s.type === 'line' ? Math.sign(s.b.x - s.a.x) : 0)).sort();
      assert.deepEqual(arrows, [-1, 1]);
    });

    it('FOLDING_TO_LEFT / RIGHT: two halves in a zig-zag from the jamb it stacks on, the fold out to the +Y side', () => {
      for (const [op, jamb] of [['FOLDING_TO_LEFT', 4.55], ['FOLDING_TO_RIGHT', 5.45]] as const) {
        const { heavy, thin } = plan(op);
        assert.equal(heavy.length, 1);
        assert.equal(thin.length, 0);
        const zig = heavy[0];
        assert.ok(zig.type === 'polyline' && zig.pts.length === 3, `${op}: three points`);
        const [foot, fold, end] = zig.pts;
        near(foot.x, jamb, `${op}: starts on its jamb`);
        near(end.y, foot.y, `${op}: folds back onto the wall line`);
        near(Math.abs(end.x - foot.x), 0.45, `${op}: the stack is half the opening`);
        assert.ok(fold.y < foot.y - 0.3, `${op}: the fold stands out to the +Y side`);
        near(fold.x, (foot.x + end.x) / 2, `${op}: the fold is in the middle`);
      }
    });

    it('DOUBLE_DOOR_FOLDING: a zig-zag on each jamb', () => {
      const { heavy } = plan('DOUBLE_DOOR_FOLDING');
      assert.equal(heavy.length, 2);
      assert.deepEqual(heavy.map((z) => (z.type === 'polyline' ? Math.round(z.pts[0].x * 100) / 100 : NaN)).sort(), [4.55, 5.45]);
    });

    it('REVOLVING: a circle with a heavy cross', () => {
      const { thin, heavy } = plan('REVOLVING');
      const circle = thin.find((s) => s.type === 'circle');
      assert.ok(circle && circle.type === 'circle');
      near(circle.r, 0.45, 'radius');
      assert.equal(heavy.filter((s) => s.type === 'line').length, 2, 'two leaves crossing');
    });

    it('DOUBLE_SWING_LEFT / RIGHT: a second, dashed arc about the same hinge on the other face, swinging to the other side', () => {
      for (const [op, hingeX] of [['DOUBLE_SWING_LEFT', 4.55], ['DOUBLE_SWING_RIGHT', 5.45]] as const) {
        const { thin, dashed } = plan(op);
        const first = thin.find((s) => s.type === 'arc');
        const second = dashed.find((s) => s.type === 'arc');
        assert.ok(first?.type === 'arc' && second?.type === 'arc', `${op}: two arcs`);
        near(first.c.x, hingeX, `${op}: hinge`);
        near(second.c.x, hingeX, `${op}: the second arc has the same hinge`);
        near(second.c.y - first.c.y, 0.06, `${op}: on the other wall face`);
        // The arc's middle point: the first swings to -y (the placement's +Y), the second the other way.
        const middle = (a: Extract<DraftShape, { type: 'arc' }>) => {
          const end = a.end < a.start ? a.end + 2 * Math.PI : a.end;
          const t = (a.start + end) / 2;
          return a.c.y + Math.sin(t) * a.r;
        };
        assert.ok(middle(first) < first.c.y, `${op}: the stated swing`);
        assert.ok(middle(second) > second.c.y, `${op}: the other swing`);
      }
    });

    it('a single swing has no second arc', () => {
      assert.equal(plan('SINGLE_SWING_LEFT').dashed.length, 0);
    });
  });

  describe('on an elevation', () => {
    const opening = (op: Operation, plane: SectionPlaneConfig, mirror = false, flips?: Record<string, number>) => {
      const [symbol] = viewElevationSymbols([door(ID(op), mirror)], plane, new Set([ID(op)]), new Set(), flips);
      return symbol ? { thin: symbol.shapes, dashed: symbol.dashed ?? [] } : null;
    };
    /** The drawing x of the door's local -X jamb (4.55 in the renderer) and +X jamb (5.45), and the door's drawing bounds. */
    const jambs = (plane: SectionPlaneConfig) => ({ minus: worldToDrawing(plane, { x: 4.55, y: 1, z: 2 }).x, plus: worldToDrawing(plane, { x: 5.45, y: 1, z: 2 }).x });
    /** The two ends of an arrow's shaft: the only two-point stroke. */
    const shaftOf = (shapes: DraftShape[]): [Pt, Pt] => {
      const s = shapes.find((x) => x.type === 'polyline' && x.pts.length === 2);
      assert.ok(s?.type === 'polyline', 'an arrow');
      return [s.pts[0], s.pts[1]];
    };
    /** The triangle: its apex is the point of the polyline that is not on the edge both others share. */
    const apexAndBase = (shapes: DraftShape[]) => {
      const tri = shapes.find((s) => s.type === 'polyline' && s.pts.length === 3);
      assert.ok(tri?.type === 'polyline', 'a triangle');
      const [p, apex, q] = tri.pts;
      return { apexX: apex.x, baseX: p.x, same: Math.abs(p.x - q.x) < 1e-9 };
    };

    it('SINGLE_SWING_LEFT: the lines on the leaf, the apex across at the handle by default and at the hinges in the hinge convention, mirrored with the placement', () => {
      for (const flipped of [false, true]) {
        const plane = ELEVATION(flipped);
        const { minus, plus } = jambs(plane);
        for (const [convention, mirror] of [['handle', false], ['hinge', false], ['handle', true], ['hinge', true]] as const) {
          useProjectStore.setState({ openingLines: convention });
          const drawn = opening('SINGLE_SWING_LEFT', plane, mirror);
          assert.ok(drawn, 'drawn');
          const { apexX, baseX, same } = apexAndBase([...drawn.thin, ...drawn.dashed]);
          assert.ok(same);
          // LEFT hinges on the placement's -X jamb; a mirrored placement puts that jamb where +X was.
          const hinge = mirror ? plus : minus;
          const other = mirror ? minus : plus;
          const hingeAt = (x: number) => Math.abs(x - hinge) < 1e-6;
          near(baseX, convention === 'handle' ? hinge : other, `${convention}${mirror ? ' mirrored' : ''}: base`);
          assert.ok(convention === 'handle' ? !hingeAt(apexX) : hingeAt(apexX), `${convention}${mirror ? ' mirrored' : ''} flipped=${flipped}: apex`);
        }
      }
    });

    it('is solid where the leaf opens towards the viewer and dashed where it opens away', () => {
      // A placement's +Y is renderer -Z: the view from -Z (flipped) looks at the side the leaf opens to.
      const towards = opening('SINGLE_SWING_LEFT', ELEVATION(true));
      const away = opening('SINGLE_SWING_LEFT', ELEVATION(false));
      assert.ok(towards && towards.thin.length > 0 && towards.dashed.length === 0, 'solid');
      assert.ok(away && away.dashed.length > 0 && away.thin.length === 0, 'dashed');
    });

    it('follows the drawing\'s flips: bit 1 the hand, bit 2 the side it opens to', () => {
      useProjectStore.setState({ openingLines: 'handle' });
      const plane = ELEVATION(true);
      const plain = apexAndBase(opening('SINGLE_SWING_LEFT', plane)!.thin);
      const handed = apexAndBase(opening('SINGLE_SWING_LEFT', plane, false, { [GUID(ID('SINGLE_SWING_LEFT'))]: 1 })!.thin);
      near(handed.apexX, plain.baseX, 'the hand flipped');
      const swung = opening('SINGLE_SWING_LEFT', plane, false, { [GUID(ID('SINGLE_SWING_LEFT'))]: 2 })!;
      assert.equal(swung.thin.length, 0);
      assert.ok(swung.dashed.length > 0, 'the side flipped');
    });

    it('DOUBLE_SWING_RIGHT: the lines of a hinge on the other jamb, solid whichever face is seen', () => {
      useProjectStore.setState({ openingLines: 'handle' });
      const plane = ELEVATION(false);
      const { minus, plus } = jambs(plane);
      const drawn = opening('DOUBLE_SWING_RIGHT', plane)!;
      assert.equal(drawn.dashed.length, 0);
      near(apexAndBase(drawn.thin).baseX, plus, 'RIGHT hinges on +X');
      assert.ok(Math.abs(apexAndBase(drawn.thin).apexX - minus) < 1e-6);
    });

    it('SLIDING_TO_LEFT / RIGHT: an arrow along the leaf towards that side', () => {
      const plane = ELEVATION(true);
      const { minus, plus } = jambs(plane);
      for (const [op, goesTo] of [['SLIDING_TO_LEFT', minus], ['SLIDING_TO_RIGHT', plus]] as const) {
        const drawn = opening(op, plane)!;
        const [a, b] = shaftOf(drawn.thin);
        assert.ok(Math.abs(b.x - goesTo) < Math.abs(a.x - goesTo), `${op}: points to the jamb it slides to`);
      }
    });

    it('DOUBLE_DOOR_SLIDING and DOUBLE_DOOR_FOLDING: a mark in each half, pointing apart; FOLDING_TO_LEFT: the lines of a folded leaf', () => {
      const plane = ELEVATION(true);
      const sliding = opening('DOUBLE_DOOR_SLIDING', plane)!;
      const arrows = sliding.thin.filter((s) => s.type === 'polyline' && s.pts.length === 2).map((s) => (s.type === 'polyline' ? Math.sign(s.pts[1].x - s.pts[0].x) : 0)).sort();
      assert.deepEqual(arrows, [-1, 1]);
      assert.ok(opening('DOUBLE_DOOR_FOLDING', plane)!.thin.length >= 4, 'two lines in each half');
      assert.ok(opening('FOLDING_TO_LEFT', plane)!.thin.length >= 2);
    });

    it('REVOLVING has no opening lines', () => {
      assert.equal(opening('REVOLVING', ELEVATION(true)), null);
    });
  });

  describe('in the DXF', () => {
    // happy-dom has no layout, so `getScreenCTM` is missing and the DXF walker writes nothing: give every element the identity.
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
    const own = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
    // The walker reads each element's stroke from the computed style, which happy-dom does not resolve from attributes.
    const realStyle = globalThis.getComputedStyle;
    before(() => {
      proto.getScreenCTM = () => new DOMMatrix();
      globalThis.getComputedStyle = ((el: Element) => ({
        stroke: el.getAttribute('stroke') ?? '', fill: el.getAttribute('fill') ?? '', fontSize: el.getAttribute('font-size') ?? '', textAnchor: el.getAttribute('text-anchor') ?? '',
      })) as unknown as typeof getComputedStyle;
    });
    after(() => {
      globalThis.getComputedStyle = realStyle;
      if (own) Object.defineProperty(proto, 'getScreenCTM', own);
      else delete proto.getScreenCTM;
    });

    const view = { id: 'v', name: 'Plan', kind: 'plan', level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, auto: false, createdAt: 0, scale: 50 } as ProjectView;
    interface Written { type: string; closed: boolean; pts: Pt[] }
    /** The SYMBOLS layer's entities as DXF writes them (model millimetres, y down): a LINE's two ends, a LWPOLYLINE's vertices. */
    const written = (op: Operation, mirror = false): Written[] => {
      const overlays = symbolOverlays([door(ID(op), mirror)], PLAN, undefined, new Set());
      const dxf = new TextDecoder('latin1').decode(viewDxf({ view, drawing: null, axis: 'down', drafts: [], layers: [], extraPatterns: [], overlays }));
      const lines = dxf.split(/\r?\n/);
      const out: (Written & { layer: string })[] = [];
      let at = -1;
      for (let i = 0; i + 1 < lines.length; i += 2) {
        const code = lines[i].trim(), value = lines[i + 1];
        if (code === '0') at = /^(LINE|LWPOLYLINE)$/.test(value) ? out.push({ type: value, closed: false, pts: [], layer: '' }) - 1 : -1;
        else if (at < 0) continue;
        else if (code === '8') out[at].layer = value.trim();
        else if (code === '70') out[at].closed = (Number(value) & 1) === 1;
        else if (code === '10' || code === '11') out[at].pts.push({ x: Number(value), y: NaN });
        else if (code === '20' || code === '21') out[at].pts[out[at].pts.length - 1].y = Number(value);
      }
      return out.filter((e) => e.layer === 'SYMBOLS');
    };
    const arcs = (list: Written[]) => list.filter((e) => e.type === 'LWPOLYLINE' && !e.closed && e.pts.length > 5);

    it('SLIDING_TO_LEFT / RIGHT: the leaf bar and an arrow that points to the stated side', () => {
      for (const [op, sign] of [['SLIDING_TO_LEFT', -1], ['SLIDING_TO_RIGHT', 1]] as const) {
        const list = written(op);
        const bar = list.find((e) => e.type === 'LWPOLYLINE' && e.closed);
        const shaft = list.find((e) => e.type === 'LINE');
        assert.ok(bar && shaft, `${op}: the bar and the arrow are in the file`);
        near(Math.max(...bar.pts.map((p) => p.x)) - Math.min(...bar.pts.map((p) => p.x)), 900, `${op}: the leaf is the width of the door`);
        assert.equal(Math.sign(shaft.pts[1].x - shaft.pts[0].x), sign, `${op}: the arrow points ${sign < 0 ? 'left' : 'right'}`);
        // A mirrored placement turns it round.
        const turned = written(op, true).find((e) => e.type === 'LINE')!;
        assert.equal(Math.sign(turned.pts[1].x - turned.pts[0].x), -sign);
      }
    });

    it('FOLDING_TO_LEFT and DOUBLE_DOOR_FOLDING: the zig-zag from the jamb, once or on each jamb', () => {
      const zigzags = (op: Operation) => written(op).filter((e) => e.type === 'LWPOLYLINE' && !e.closed && e.pts.length === 3);
      const single = zigzags('FOLDING_TO_LEFT');
      assert.equal(single.length, 1);
      near(single[0].pts[0].x, 4550, 'on the left jamb');
      assert.deepEqual(zigzags('DOUBLE_DOOR_FOLDING').map((z) => z.pts[0].x).sort(), [4550, 5450]);
    });

    it('REVOLVING: the circle and the two leaves of its cross', () => {
      const list = written('REVOLVING');
      assert.equal(list.filter((e) => e.type === 'LINE').length, 2);
      assert.equal(list.filter((e) => e.type === 'LWPOLYLINE' && e.closed && e.pts.length > 5).length, 1, 'the circle');
    });

    it('DOUBLE_SWING_LEFT: both arcs; SINGLE_SWING_LEFT: one', () => {
      assert.equal(arcs(written('DOUBLE_SWING_LEFT')).length, 2);
      assert.equal(arcs(written('SINGLE_SWING_LEFT')).length, 1);
    });
  });
});
