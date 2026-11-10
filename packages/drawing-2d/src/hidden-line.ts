/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hidden Line Classifier - Determine visibility of lines via depth testing
 *
 * Uses software rasterization (hidden-line-raster.ts) to build a min-depth
 * buffer of the KEPT half of the section, then classifies each line segment
 * as visible, hidden, or partially visible.
 *
 * # Depth convention (issue #2639, see projection-bands.ts)
 * Both the buffer and `DrawingLine.depth` / `depthEnd` carry the VIEW DEPTH
 * `-d` (the negated flip-adjusted signed depth): 0 at the cut plane,
 * increasing into the kept half, smaller means nearer the viewer. A line
 * sample is visible where `lineDepth <= bufferDepth + depthBias`.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { Point2D, DrawingLine, Bounds2D, VisibilityState, SectionPlaneConfig } from './types.js';
import { point2DLerp, point2DDistance, EPSILON } from './math.js';
import { buildDepthRaster, ownerKey, type DepthRaster } from './hidden-line-raster.js';
import { PIXEL, hiddenByItself, ownSurfaceBeside, rasterPixel } from './hidden-line-own.js';
import type { ClipPlane } from './clip-rim.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VisibilitySegment {
  start: Point2D;
  end: Point2D;
  visible: boolean;
  /**
   * Affine parameters of `start`/`end` along the parent line (0..1), the
   * same parameterisation the classifier sampled visibility with. Callers
   * carrying per-endpoint metadata (view depth) over onto split segments
   * must lerp with these so the metadata and the visibility decision
   * cannot disagree.
   */
  tStart: number;
  tEnd: number;
}

export interface VisibilityResult {
  line: DrawingLine;
  segments: VisibilitySegment[];
  overallVisibility: VisibilityState;
}

/** What a view seen from outside (an axonometric) asks of the generator on top of the defaults every cardinal view has. */
export interface ExteriorViewOptions {
  /** Pixels of tolerance for an edge lying on its occluder's outline (`HiddenLineOptions.edgeTolerancePx`). Absent: none. */
  hiddenLineEdgeTolerancePx?: number;
  /**
   * The drawing is a view from a camera (an axonometric, the 3D-view PDF), not a section, a plan or an elevation. Such
   * a view keeps the line work it always had for curved surfaces: no outline along smooth edges and no own surface
   * depth for it (`silhouette-lines.ts`, #557), which on an axonometric let lines show past what is in front of them.
   */
  cameraView?: boolean;
  /**
   * Also draw the creases facing the viewer, not only the silhouette
   * (`EdgeExtractor.extractExteriorEdges`): the corners of a wall or a slab seen
   * from outside. Absent: the silhouette only, which plans, sections and
   * elevations draw.
   */
  includeFeatureEdges?: boolean;
  /**
   * Meshes rasterised into the depth buffer only, drawing nothing: the cut
   * faces a caller puts on solids it clipped open (a cut-away axonometric),
   * so an edge inside a clipped wall is hidden by its cut face.
   */
  extraOccluders?: MeshData[];
  /** Half-spaces the meshes were clipped to: their open rim is the caller's to draw, and is left out here (`clip-rim.ts`). */
  clipPlanes?: readonly ClipPlane[];
}

export interface HiddenLineOptions {
  /** Resolution of depth buffer (pixels on longest axis) */
  resolution: number;
  /** Number of samples along each line for visibility testing */
  samplesPerLine: number;
  /** Depth bias to avoid z-fighting */
  depthBias: number;
  /**
   * Whole pixels around a sample whose depth is also consulted: the sample is
   * visible when ANY pixel in that neighbourhood lets it through. 0 (the
   * default) reads the one pixel under the sample. A line lying exactly on the
   * outline of its own occluder (a silhouette edge) is on the boundary of the
   * occluder's covered pixels, so a point sample flips between "inside" and
   * "outside" along it and the edge prints with gaps; one pixel of tolerance
   * keeps it whole, and the depth test allows that many pixels of model as
   * slack. The cost is that a truly hidden line within that many pixels of an
   * uncovered one, or behind a surface by less than the slack, reads visible,
   * which under-hides and never erases real geometry.
   */
  edgeTolerancePx: number;
}

/** Halvings of the gap between two samples that disagree: 2^-7 of a tenth of a line, under a millimetre on a 3 m edge. */
const TRANSITION_BISECTIONS = 7;

const DEFAULT_OPTIONS: HiddenLineOptions = {
  resolution: 1024,
  samplesPerLine: 10,
  depthBias: 0.001,
  edgeTolerancePx: 0,
};

/**
 * View depth along a line as an affine function of the line parameter t
 * (0 = start, 1 = end). An absent `depthEnd` means constant depth - `??`,
 * never `||`: `depthEnd: 0` is a real value, an endpoint exactly ON the cut
 * plane. Single source for sampling (classifySingleLine) and for re-deriving
 * split-segment depths (applyVisibility), so the two cannot disagree.
 */
function lineDepthAt(line: DrawingLine): (t: number) => number {
  const depthStart = line.depth;
  const depthEnd = line.depthEnd ?? line.depth;
  return (t: number) => depthStart + (depthEnd - depthStart) * t;
}

// ═══════════════════════════════════════════════════════════════════════════
// HIDDEN LINE CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════

export class HiddenLineClassifier {
  private options: HiddenLineOptions;

  /** Null after build when no occluder rasterized: everything is visible. */
  private raster: DepthRaster | null = null;
  private built = false;
  /** The tolerance of the depth buffer last built (`buildDepthBuffer`'s argument, else the constructor's option). */
  private edgeTolerancePx = 0;

  constructor(options: Partial<HiddenLineOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Build the occluder depth buffer for the KEPT half of the section
   * (flip-adjusted depth in `[-occluderDepth, 0]`), storing view depths.
   *
   * Takes the FULL plane config (issue #2639): a custom (face-picked) plane
   * is honoured via the same `signedDepth` / `projectPointForPlane` helpers
   * the line producers use, so buffer and lines agree by construction. For
   * cardinal planes the projection is numerically identical to the old
   * axis/position/flipped path (same axis mapping, same `flipped ? -u : u`).
   *
   * @param meshes Source meshes (world = per-mesh origin + local positions)
   * @param plane Section plane (cardinal fields, plus optional customPlane)
   * @param occluderDepth How far into the kept half occluders rasterize
   * @param bounds Optional pre-computed 2D bounds
   * @param edgeTolerancePx See `HiddenLineOptions.edgeTolerancePx`; defaults to the constructor's option
   */
  buildDepthBuffer(
    meshes: MeshData[],
    plane: SectionPlaneConfig,
    occluderDepth: number,
    bounds?: Bounds2D,
    edgeTolerancePx = this.options.edgeTolerancePx,
  ): void {
    this.edgeTolerancePx = edgeTolerancePx;
    this.raster = buildDepthRaster(
      meshes,
      plane,
      occluderDepth,
      this.options.resolution,
      this.options.depthBias,
      bounds,
    );
    this.built = true;
  }

  /** Whether `line` is hidden somewhere by its own element's surface (`hiddenByItself`): only then does own depth matter. */
  coveredByItself(line: DrawingLine): boolean {
    return this.raster !== null && hiddenByItself(this.raster, line, Math.max(2, this.options.samplesPerLine), this.options.depthBias);
  }

  /**
   * Classify lines as visible or hidden based on depth buffer
   */
  classifyLines(lines: DrawingLine[]): VisibilityResult[] {
    if (!this.built) {
      throw new Error('Depth buffer not built. Call buildDepthBuffer first.');
    }

    const results: VisibilityResult[] = [];

    for (const line of lines) {
      const result = this.classifySingleLine(line);
      results.push(result);
    }

    return results;
  }

  /**
   * Update lines with visibility classification
   * Returns new array with visibility set
   */
  applyVisibility(lines: DrawingLine[]): DrawingLine[] {
    const results = this.classifyLines(lines);

    const output: DrawingLine[] = [];

    for (const result of results) {
      if (result.overallVisibility === 'visible') {
        output.push({ ...result.line, visibility: 'visible' });
      } else if (result.overallVisibility === 'hidden') {
        output.push({ ...result.line, visibility: 'hidden' });
      } else {
        // Partial visibility - split into segments, re-deriving each split
        // segment's depth/depthEnd AT ITS OWN ENDPOINTS via the same affine
        // parameterisation the classifier sampled with. Spreading the parent
        // line's original pair onto every split (the pre-fix behaviour)
        // attached depths describing the PARENT's endpoints to segments that
        // start or end elsewhere, and line-merger then faithfully propagated
        // those stale values into merged output (PR #2644 review).
        const depthAt = lineDepthAt(result.line);
        for (const seg of result.segments) {
          const depth = depthAt(seg.tStart);
          const depthEnd = depthAt(seg.tEnd);
          const split: DrawingLine = {
            ...result.line,
            line: { start: seg.start, end: seg.end },
            visibility: seg.visible ? 'visible' : 'hidden',
            depth,
          };
          if (depthEnd !== depth) {
            split.depthEnd = depthEnd;
          } else {
            // "Omitted means constant depth" - don't leak the parent's
            // depthEnd onto a constant-depth split.
            delete split.depthEnd;
          }
          output.push(split);
        }
      }
    }

    return output;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private classifySingleLine(line: DrawingLine): VisibilityResult {
    const { samplesPerLine, depthBias } = this.options;
    const lineLength = point2DDistance(line.line.start, line.line.end);

    // View depth varies along the line when the producer supplied a
    // per-endpoint `depthEnd` (e.g. a sloped edge); lerp it per sample.
    const depthAt = lineDepthAt(line);

    // For very short lines, just test the midpoint
    const numSamples = lineLength < EPSILON ? 1 : Math.max(2, samplesPerLine);

    const segments: VisibilitySegment[] = [];
    let currentStart = line.line.start;
    let currentT = 0;
    const owner = ownerKey(line.entityId, line.modelIndex ?? 0);
    let currentVisible = this.sampleVisibility(line.line.start, depthAt(0), depthBias, owner);
    let visibleCount = currentVisible ? 1 : 0;

    for (let i = 1; i <= numSamples; i++) {
      const t = i / numSamples;
      // The final sample is the EXACT endpoint: a lerp at t = 1 can
      // overshoot it by one ulp on sign-straddling coordinates (e.g.
      // -0.3 + (0.1 - -0.3) > 0.1) and land outside the raster bounds,
      // misreading a fully occluded endpoint as visible (PR #2644 review).
      const point =
        i === numSamples ? line.line.end : point2DLerp(line.line.start, line.line.end, t);
      const isVisible = this.sampleVisibility(point, depthAt(t), depthBias, owner);

      if (isVisible) visibleCount++;

      // Open a transition on any visibility change - INCLUDING one at the
      // final sample. The previous `i < numSamples` guard swallowed a flip
      // there, so `overallVisibility` (counted over ALL samples) could say
      // 'partial' while the emitted segments were one uniform run; now the
      // two derive from the same transitions and cannot disagree.
      if (isVisible !== currentVisible) {
        // Find the transition point: bisect between the two samples that disagree. Halfway between them was off by half
        // a sample (0.135 m on a 2.7 m wall edge) and drew that stub of a hidden edge past the slab in front of it (#557).
        let lo = (i - 1) / numSamples;
        let hi = t;
        for (let k = 0; k < TRANSITION_BISECTIONS; k++) {
          const mid = (lo + hi) / 2;
          if (this.sampleVisibility(point2DLerp(line.line.start, line.line.end, mid), depthAt(mid), depthBias, owner) === currentVisible) lo = mid;
          else hi = mid;
        }
        const transitionT = (lo + hi) / 2;
        const transitionPoint = point2DLerp(line.line.start, line.line.end, transitionT);

        segments.push({
          start: currentStart,
          end: transitionPoint,
          visible: currentVisible,
          tStart: currentT,
          tEnd: transitionT,
        });

        currentStart = transitionPoint;
        currentT = transitionT;
        currentVisible = isVisible;
      }
    }

    // Final segment
    segments.push({
      start: currentStart,
      end: line.line.end,
      visible: currentVisible,
      tStart: currentT,
      tEnd: 1,
    });

    // Determine overall visibility. With transitions opened on every flip
    // this is equivalent to deriving it from the segments: all samples
    // visible = one visible segment, none visible = one hidden segment,
    // anything else opened at least one transition.
    let overallVisibility: VisibilityState;
    if (visibleCount === numSamples + 1) {
      overallVisibility = 'visible';
    } else if (visibleCount === 0) {
      overallVisibility = 'hidden';
    } else {
      overallVisibility = 'partial';
    }

    return { line, segments, overallVisibility };
  }

  private sampleVisibility(point: Point2D, lineDepth: number, depthBias: number, owner: number): boolean {
    const raster = this.raster;
    // No raster means no occluder rasterized into the kept half: nothing can
    // hide the line (issue #2639 - the previous code indexed the buffer with
    // NaN here and classified everything hidden).
    if (!raster) return true;

    const { bounds, width, height, buffer } = raster;

    if (!rasterPixel(raster, point)) return true;
    const ix = PIXEL[0], iy = PIXEL[1];

    // Line is visible if it's at or in front of the depth buffer at the sample's
    // pixel. With a tolerance, the pixels within `reach` of it are consulted too
    // (one outside the raster counts as uncovered), and the depth may exceed the
    // buffer's by up to `reach` pixels' worth of model: a pixel's centre sits up
    // to half a pixel off the edge that was sampled, and across a sloped face
    // that is a depth step larger than the bias, which would hide the inner
    // corner of a wall and a slab. Without a tolerance a covered sample is still
    // visible when its own element shows at its depth in a pixel beside it (`ownSurfaceBeside`).
    const reach = this.edgeTolerancePx;
    if (reach === 0) return lineDepth <= buffer[iy * width + ix] + depthBias || ownSurfaceBeside(raster, ix, iy, lineDepth, owner, depthBias);
    const pixel = Math.max((bounds.max.x - bounds.min.x) / (width - 1), (bounds.max.y - bounds.min.y) / (height - 1));
    const slack = depthBias + reach * pixel;
    for (let y = iy - reach; y <= iy + reach; y++) {
      for (let x = ix - reach; x <= ix + reach; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) return true;
        if (lineDepth <= buffer[y * width + x] + slack) return true;
      }
    }
    return false;
  }
}
