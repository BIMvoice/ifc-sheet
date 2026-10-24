/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The framing rule (#268) on built-up buildings: a survey marker far away is
 * left out of the frame; a detached garage, a long site wall, a building in two
 * wings and a thin mast are not. Every expected extent is computed here from
 * the boxes with plain min/max, not through the helper.
 */

import { describe, expect, it } from 'vitest';
import type { BoundingBox3D } from './entity-bounds.js';
import { farElementLabel, FRAMING_RULE, frameElements, type FramedElement } from './framing.js';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BoundingBox3D => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

/** The boxes a test builds, keyed in order. */
class Scene {
  readonly elements: FramedElement[] = [];
  add(b: BoundingBox3D): number {
    this.elements.push({ key: this.elements.length, box: b });
    return this.elements.length - 1;
  }

  /** A building w x d (m) from (x, z): three storeys of 4 m wall segments round the edge and 4 m slab tiles. */
  building(x: number, z: number, w = 60, d = 40): void {
    for (let storey = 0; storey < 3; storey++) {
      const y = storey * 3;
      for (let i = 0; i < w; i += 4) {
        const l = Math.min(4, w - i);
        this.add(box(x + i, y, z, x + i + l, y + 3, z + 0.3));
        this.add(box(x + i, y, z + d - 0.3, x + i + l, y + 3, z + d));
      }
      for (let j = 0; j < d; j += 4) {
        const l = Math.min(4, d - j);
        this.add(box(x, y, z + j, x + 0.3, y + 3, z + j + l));
        this.add(box(x + w - 0.3, y, z + j, x + w, y + 3, z + j + l));
      }
      for (let i = 0; i < w; i += 5) for (let j = 0; j < d; j += 5) this.add(box(x + i, y, z + j, x + Math.min(i + 5, w), y + 0.2, z + Math.min(j + 5, d)));
    }
  }

  /** The 1.8 x 5 x 2.5 m survey cube of the Skolebygg sample, its west face at x. */
  marker(x: number, z = 0): number {
    return this.add(box(x, 0, z, x + 1.8, 5, z + 2.5));
  }

  /** Min and max of all boxes but `except`, by hand. */
  union(except: readonly number[] = []): BoundingBox3D {
    const own = this.elements.filter((e) => !except.includes(e.key));
    const out = box(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
    for (const { box: b } of own) {
      for (const k of ['x', 'y', 'z'] as const) {
        out.min[k] = Math.min(out.min[k], b.min[k]);
        out.max[k] = Math.max(out.max[k], b.max[k]);
      }
    }
    return out;
  }
}

describe('a survey marker far from the building', () => {
  it('is left out, and the frame is exactly the building', () => {
    const s = new Scene();
    s.building(0, 0);
    const building = s.union();
    const m = s.marker(-100);
    const framing = frameElements(s.elements);
    expect(framing.extent).toEqual(building);
    expect(framing.farElements.map((f) => f.key)).toEqual([m]);
    // 98.2 m of x between the marker's east face (-98.2) and the building, z and y overlap.
    expect(framing.farElements[0].distance).toBeCloseTo(98.2, 6);
  });

  it('names the farthest first and drops each of several, apart from one another, on every side', () => {
    const s = new Scene();
    s.building(0, 0);
    const west = s.marker(-100);
    const south = s.marker(10, 200);
    const framing = frameElements(s.elements);
    expect(framing.farElements.map((f) => f.key)).toEqual([south, west]);
    expect(framing.extent).toEqual(s.union([west, south]));
  });

  it('stays in the frame when the project says to include far-away elements, exactly as before', () => {
    const s = new Scene();
    s.building(0, 0);
    s.marker(-100);
    const framing = frameElements(s.elements, { includeFar: true });
    expect(framing.extent).toEqual(s.union());
    expect(framing.farElements).toEqual([]);
  });

  it('is kept when it is only a modest distance away: the rule is about the building, not about metres', () => {
    const s = new Scene();
    s.building(0, 0); // span 60 m
    s.marker(-50); // 48.2 m of gap: under one span
    expect(frameElements(s.elements).farElements).toEqual([]);
    expect(frameElements(s.elements).extent).toEqual(s.union());
  });

  it('is judged by the same ratios on a building ten times the size', () => {
    const big = new Scene();
    big.building(0, 0, 300, 200); // span 300 m, a marker that is small by it is up to 30 m
    big.add(box(-1500, 0, 0, -1498, 5, 2.5)); // 1500 m out, 5 m: far and small
    big.add(box(-200, 0, 0, -198, 5, 2.5)); // 198 m out, under one span
    expect(frameElements(big.elements).farElements.map((f) => f.key)).toEqual([big.elements.length - 2]);
  });

  it('is only left out while it is small: 0.1 of the span is the limit', () => {
    const s = new Scene();
    s.building(0, 0); // span 60, so up to 6 m
    const at6 = s.add(box(-100, 0, 0, -94, 1, 1));
    const at61 = s.add(box(-100, 0, 10, -93.9, 1, 11));
    expect(frameElements(s.elements).farElements.map((f) => f.key)).toEqual([at6]);
    expect(at61).toBeGreaterThan(at6);
  });
});

describe('real parts of a site stay framed', () => {
  it('a detached garage built of several pieces, at a modest distance or well away', () => {
    const s = new Scene();
    s.building(0, 0); // span 60 m
    const garage = (size: number, gap: number): Scene => {
      const g = new Scene();
      g.elements.push(...s.elements);
      const x = 60 + gap;
      g.add(box(x, 0, 5, x + size, 0.2, 5 + size)); // slab
      for (const [x0, z0, x1, z1] of [[0, 0, size, 0.3], [0, size - 0.3, size, size], [0, 0, 0.3, size], [size - 0.3, 0, size, size]]) g.add(box(x + x0, 0, 5 + z0, x + x1, 2.6, 5 + z1));
      return g;
    };
    for (const [size, gap] of [[6, 50], [8, 50], [8, 150]]) {
      const g = garage(size, gap);
      expect(frameElements(g.elements).farElements, `${size} m garage, ${gap} m away`).toEqual([]);
      expect(frameElements(g.elements).extent).toEqual(g.union());
    }
  });

  it('a garage that is one element', () => {
    const s = new Scene();
    s.building(0, 0);
    s.add(box(160, 0, 5, 168, 2.6, 13));
    expect(frameElements(s.elements).farElements).toEqual([]);
  });

  it('a long site wall, whole or in short lengths, round the building', () => {
    const whole = new Scene();
    whole.building(0, 0);
    whole.add(box(-60, 0, 140, 120, 2, 140.3)); // 180 m long, 100 m from the building
    expect(frameElements(whole.elements).farElements).toEqual([]);
    expect(frameElements(whole.elements).extent).toEqual(whole.union());

    const pieces = new Scene();
    pieces.building(0, 0);
    for (let x = -60; x < 120; x += 3) pieces.add(box(x, 0, 140, x + 3, 2, 140.3)); // 3 m lengths: each small and far
    expect(frameElements(pieces.elements).farElements).toEqual([]);
    expect(frameElements(pieces.elements).extent).toEqual(pieces.union());
  });

  it('a building in two wings 20 m apart', () => {
    const s = new Scene();
    s.building(0, 0, 25, 20);
    s.building(45, 0, 25, 20); // a wing of 25 m in a whole of 70 m
    const framing = frameElements(s.elements);
    expect(framing.farElements).toEqual([]);
    expect(framing.extent).toEqual(s.union());
  });

  it('a small annex wing 20 m off a large main building, however few its elements', () => {
    const s = new Scene();
    s.building(0, 0, 60, 40);
    for (let i = 0; i < 6; i++) s.add(box(80 + (i % 3) * 1.5, 0, (i >> 1) * 1.5, 81 + (i % 3) * 1.5, 3, 1 + (i >> 1) * 1.5)); // 6 posts, each 1 m
    expect(frameElements(s.elements).farElements).toEqual([]);
  });

  it('a tall thin mast', () => {
    const s = new Scene();
    s.building(0, 0);
    s.add(box(170, 0, 10, 170.4, 25, 10.4));
    expect(frameElements(s.elements).farElements).toEqual([]);
    expect(frameElements(s.elements).extent?.max.y).toBe(25);
  });
});

describe('what the rule leaves alone', () => {
  it('frames a model with no stray on exactly the union of its boxes', () => {
    const s = new Scene();
    s.building(3.25, -7.5);
    expect(frameElements(s.elements)).toEqual({ extent: s.union(), farElements: [] });
  });

  it('frames a handful of elements whole: with so few the strays cannot be told from the building', () => {
    const s = new Scene();
    s.add(box(0, 0, 0, 20, 3, 20));
    s.marker(-300);
    expect(frameElements(s.elements).farElements).toEqual([]);
  });

  it('has no frame for no elements', () => {
    expect(frameElements([])).toEqual({ extent: null, farElements: [] });
  });

  it('does not move on a flat or a single-point model', () => {
    const s = new Scene();
    for (let i = 0; i < 10; i++) s.add(box(1, 1, 1, 1, 1, 1));
    expect(frameElements(s.elements).extent).toEqual(box(1, 1, 1, 1, 1, 1));
  });
});

describe('the rule and its names', () => {
  it('states its three fractions of the span', () => {
    expect(FRAMING_RULE).toEqual({ trim: 0.025, small: 0.1, far: 1 });
  });

  it('names an element by its Name, else by its class and GlobalId', () => {
    expect(farElementLabel({ name: 'NUS - 0,0 - Kake', type: 'IfcBuildingElementProxy', globalId: '1cHGmPSXzFhOqVxhbE1HnR' })).toBe('NUS - 0,0 - Kake');
    expect(farElementLabel({ name: ' ', type: 'IfcBuildingElementProxy', globalId: '1cHGmPSXzFhOqVxhbE1HnR' })).toBe('IfcBuildingElementProxy 1cHGmPSXzFhOqVxhbE1HnR');
    expect(farElementLabel({})).toBe('Element');
  });
});
