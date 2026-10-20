/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What `useDrawingGeneration` is given: the geometry, the cut, the display options and the store actions. */

import type { IfcSourceBytes } from '@ifc-lite/parser';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import type { SpatialHierarchy } from '@ifc-lite/data';
import type { TypeVisibilityGate } from '@/store/typeVisibilityFilter';

export interface UseDrawingGenerationParams {
  geometryResult: GeometryResult | null | undefined;
  // `spatialHierarchy` (optional — absent on cache-reopened models) backs the
  // current-floor projection scoping (issue #979 follow-up). The runtime
  // already passes the full DataStore from `useIfc()`, so this is a pure type
  // widen, not new prop threading.
  ifcDataStore: { source: IfcSourceBytes; spatialHierarchy?: SpatialHierarchy } | null;
  /**
   * Section plane state. `custom` is the optional face-pick override
   * (issue #243); when set the cutter cuts on that arbitrary plane and
   * the cap basis flows from `custom.tangent`/`bitangent` so the cap
   * silhouette lands precisely on the tilted plane.
   */
  sectionPlane: {
    axis: 'down' | 'front' | 'side';
    position: number;
    flipped: boolean;
    custom?: {
      normal:    [number, number, number];
      distance:  number;
      pickedAt:  [number, number, number];
      tangent:   [number, number, number];
      bitangent: [number, number, number];
    };
  };
  displayOptions: { showHiddenLines: boolean; useSymbolicRepresentations: boolean; show3DOverlay: boolean; scale: number; showConstructionProjection: boolean; constructionProjectionDepth?: number | null };
  /**
   * Class-level Visibility toggles (Spaces, Openings, Site, Virtual Elements,
   * Spatial Zones, Annotations). Global, not 3D-only — see the filter in
   * `generateDrawing` (issue #2060).
   */
  typeVisibility: TypeVisibilityGate;
  combinedHiddenIds: Set<number>;
  combinedIsolatedIds: Set<number> | null;
  computedIsolatedIds?: Set<number> | null;
  models: Map<string, { id: string; visible: boolean; idOffset?: number }>;
  panelVisible: boolean;
  activeTool: string;
  drawing: Drawing2D | null;
  // Store actions
  setDrawing: (d: Drawing2D | null) => void;
  setDrawingStatus: (s: 'idle' | 'generating' | 'ready' | 'error') => void;
  setDrawingProgress: (p: number, phase: string) => void;
  setDrawingError: (e: string | null) => void; /** false: a project view's own generator, without the shared drawing's global side effects. */ primary?: boolean;
}
