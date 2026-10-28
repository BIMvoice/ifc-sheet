/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Location panel builds no map while the viewport is covered (#154). In IfcSheet the
 * Wall covers the engine's interface for good, and the hidden map's WebGL probe, context and
 * shader compile were the longest main-thread tasks left after a large model was read.
 *
 * happy-dom has no WebGL, so an attempt shows as the probe's canvas and its latched
 * `probe_no_context` verdict; no attempt leaves both untouched.
 */

import '@/test/setup-dom.js';
import { afterEach, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MapConversion, ProjectedCRS } from '@ifc-lite/parser';
import { act } from 'react';
import { cleanup, render, waitFor } from '@/test/render.js';
import { getMapWebglVerdict, resetMapWebglSupportForTests } from '@/lib/geo/map-webgl-support.js';
import { coverViewport } from '../viewport-cover.js';
import { LocationMap } from './LocationMap.js';

const conversion = { eastings: 2619073, northings: 1263523, orthogonalHeight: 0, xAxisAbscissa: 1, xAxisOrdinate: 0, scale: 1 } as unknown as MapConversion;
const crs = { name: 'EPSG:2056' } as unknown as ProjectedCRS;

let lift: (() => void) | null = null;
let canvases = 0;
const createElement = document.createElement;
document.createElement = function (this: Document, tag: string, options?: ElementCreationOptions) {
  if (String(tag).toLowerCase() === 'canvas') canvases++;
  return createElement.call(this, tag, options);
} as typeof document.createElement;

afterEach(() => {
  cleanup();
  lift?.();
  lift = null;
  canvases = 0;
  resetMapWebglSupportForTests();
});

const settle = () => new Promise((r) => setTimeout(r, 300));

it('builds no map while covered, and builds it once the cover lifts', async () => {
  lift = coverViewport();
  const ui = render(<LocationMap mapConversion={conversion} projectedCRS={crs} />);
  await waitFor(() => ui.textContent?.includes('47.52217, 7.69186') === true, 'origin readout');
  await settle(); // the map would be built after the maplibre chunk resolves
  assert.equal(canvases, 0, 'no WebGL probe canvas while covered');
  assert.equal(getMapWebglVerdict(), null, 'no WebGL attempt while covered');

  act(() => { lift?.(); lift = null; });
  await waitFor(() => getMapWebglVerdict() !== null, 'the map is attempted once uncovered');
  assert.ok(canvases > 0);
});

it('an uncovered panel attempts the map as before', async () => {
  const ui = render(<LocationMap mapConversion={conversion} projectedCRS={crs} />);
  await waitFor(() => ui.textContent?.includes('47.52217, 7.69186') === true, 'origin readout');
  await waitFor(() => getMapWebglVerdict() !== null, 'the map is attempted');
});
