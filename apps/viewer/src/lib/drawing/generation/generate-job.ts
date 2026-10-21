/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One drawing's run of `Drawing2DGenerator`, as the generation worker and
 * the in-process path both make it (#154). There is one copy of the call, so
 * the two cannot drift: what differs between them is only where the meshes
 * and the outline binding come from.
 */

import { Drawing2DGenerator, type Drawing2D, type ProfileEntry, type SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { createMeshOutlineProvider, type MeshOutline2dFn } from '@/hooks/meshOutlineProvider';

/** The generator options a drawing job carries; plain data, so it can cross to a worker. */
export interface GenerateJobOptions {
  includeHiddenLines: boolean;
  includeProjection: boolean;
  includeEdges: boolean;
  mergeLines: boolean;
  /** Project non-extruded geometry through the winding-robust `meshOutline2d` binding. */
  outline: boolean;
}

export interface GenerateJob {
  meshes: MeshData[];
  config: SectionConfig;
  options: GenerateJobOptions;
  profiles?: ProfileEntry[];
}

export type ProgressFn = (stage: string, progress: number) => void;

export async function runGenerateJob(
  job: GenerateJob,
  outlineFn: MeshOutline2dFn | undefined,
  onProgress?: ProgressFn,
): Promise<Drawing2D> {
  const { includeHiddenLines, includeProjection, includeEdges, mergeLines, outline } = job.options;
  const generator = new Drawing2DGenerator();
  try {
    await generator.initialize();
    return await generator.generate(job.meshes, job.config, {
      includeHiddenLines,
      includeProjection,
      includeEdges,
      mergeLines,
      outlineProvider: outline && outlineFn ? createMeshOutlineProvider(outlineFn) : undefined,
      onProgress,
    }, job.profiles);
  } finally {
    generator.dispose();
  }
}
