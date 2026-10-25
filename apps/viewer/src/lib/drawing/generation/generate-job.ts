/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One drawing's run of `Drawing2DGenerator`, as the generation worker and
 * the in-process path both make it (#154). There is one copy of the call, so
 * the two cannot drift: what differs between them is only where the meshes
 * and the outline binding come from.
 */

import { Drawing2DGenerator, createSectionConfig, type Drawing2D, type ProfileEntry, type SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { drawAxonometricView } from '@bimvoice/ifcsheet/axonometric';
import type { ProjectLevel, ThreeDProjectView } from '@/project/types';
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

/** A 3D view drawn as an axonometric instead of a cut on a plane (#97): plain data, so it can cross to a worker. */
export interface AxonometricJob {
  view: ThreeDProjectView;
  /** The loaded levels, which place a cut-away's storey cut. */
  levels: ProjectLevel[];
}

export interface GenerateJob {
  meshes: MeshData[];
  /** The plane cut; unused by an axonometric job (see {@link axonometricJob}). */
  config: SectionConfig;
  options: GenerateJobOptions;
  profiles?: ProfileEntry[];
  /** Draw this 3D view as an axonometric (`@bimvoice/ifcsheet/axonometric`) instead of cutting `config`. */
  axonometric?: AxonometricJob;
}

/** The job fields for drawing `view` as an axonometric: its `config` and `options` are placeholders the job does not read. */
export function axonometricJob(view: ThreeDProjectView, levels: readonly ProjectLevel[]): Pick<GenerateJob, 'config' | 'options' | 'axonometric'> {
  return {
    config: createSectionConfig('y', 0),
    options: { includeHiddenLines: true, includeProjection: true, includeEdges: true, mergeLines: true, outline: false },
    axonometric: { view, levels: [...levels] },
  };
}

export type ProgressFn = (stage: string, progress: number) => void;

export async function runGenerateJob(
  job: GenerateJob,
  outlineFn: MeshOutline2dFn | undefined,
  onProgress?: ProgressFn,
): Promise<Drawing2D> {
  if (job.axonometric) return drawAxonometricView(job.meshes, job.axonometric.view, job.axonometric.levels, onProgress);
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
