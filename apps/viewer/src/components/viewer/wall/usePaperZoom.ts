/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The zoom a sheet's paper is drawn at, apart from the zoom on screen (#913). A heavy drawing (millions of path
 * characters) costs the browser a full re-raster each time the paper SVG changes size: every wheel tick of a zoom did
 * that, so the frames of a gesture took two to three times a frame's budget. While the zoom moves, the paper stays drawn
 * at the zoom it settled at and the screen scales that picture on its own compositor layer; once the zoom has held still
 * for `SETTLE_MS`, the paper is drawn again, sharp, at the new zoom. A pan only moves the layer, so it never re-rasters.
 */

import { useEffect, useState, type CSSProperties } from 'react';

/** How long the zoom must hold still before the paper is drawn again at it, ms. */
export const SETTLE_MS = 180;

export interface PaperZoom {
  /** Pixels per paper millimetre the paper is drawn at. */
  drawnK: number;
  /** The style of the layer that carries the paper: where it sits and how much the screen scales it. */
  layerStyle: CSSProperties;
  /** Draw the paper at `k` now, with no settle: a fit (on arrival, a new paper, a request) is not a gesture. */
  drawAt: (k: number) => void;
}

/** @param pan where the paper's top-left corner is on screen, px, and the zoom on screen, px per mm. */
export function usePaperZoom(pan: { x: number; y: number; k: number }): PaperZoom {
  const [drawnK, setDrawnK] = useState(pan.k);
  useEffect(() => {
    if (pan.k === drawnK) return undefined;
    const settle = setTimeout(() => setDrawnK(pan.k), SETTLE_MS);
    return () => clearTimeout(settle);
  }, [pan.k, drawnK]);
  const scale = pan.k / drawnK;
  return {
    drawnK,
    layerStyle: {
      transform: scale === 1 ? `translate(${pan.x}px, ${pan.y}px)` : `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
      transformOrigin: '0 0',
      willChange: 'transform',
    },
    drawAt: setDrawnK,
  };
}
