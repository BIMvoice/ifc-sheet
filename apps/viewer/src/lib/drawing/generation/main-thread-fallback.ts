/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Views drawn on the page's own thread when the drawing worker cannot be used
 * (#863).
 *
 * Every view of a set asks for its drawing at once. When the worker failed,
 * each of those requests used to start cutting on the main thread straight
 * away, so on a large model the page froze until the last view was done: the
 * set looked as if it never finished. Here they wait their turn: one view at
 * a time, with the event loop turned between two, so the page paints, answers
 * input, and shows each sheet as its drawing arrives.
 *
 * How many views are waiting here is observable, so the interface can say
 * that drawings are being made slowly ({@link subscribeMainThreadDrawings}).
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import { runGenerateJob, type GenerateJob, type ProgressFn } from './generate-job';

type Runner = typeof runGenerateJob;

/**
 * A turn of the event loop as an ordinary task. Not `scheduler.yield()`: its
 * continuation runs ahead of other tasks, so the next view would start before
 * React commits the drawing just made and the sheets would still appear all
 * at the end.
 */
const betweenViews = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let runner: Runner = runGenerateJob;
let queue: Promise<void> = Promise.resolve();
let waiting = 0;
const listeners = new Set<(waiting: number) => void>();

function setWaiting(next: number): void {
  waiting = next;
  for (const listener of listeners) listener(waiting);
}

/** Views queued or being drawn on the main thread now. */
export function mainThreadDrawingsWaiting(): number {
  return waiting;
}

/** Called with the number of views queued or being drawn on the main thread, whenever it changes. */
export function subscribeMainThreadDrawings(listener: (waiting: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The most vertices a view may draw on the main thread. One view is one
 * synchronous cut that the page cannot interrupt, and a large one froze the
 * reporter's page for more than five minutes (#863): a frozen page is worse
 * than a view that says it could not be drawn. Measured in the production
 * build, the main thread cut about 230,000 vertices a second (skolebygg, 1.65 M
 * vertices, 7.3 s for its largest view), so this keeps a view to about a
 * second and a half.
 */
export const MAIN_THREAD_MAX_VERTICES = 350_000;

/** Vertices `meshes` hold. */
export function verticesOf(meshes: readonly { positions: ArrayLike<number> }[]): number {
  let total = 0;
  for (const mesh of meshes) total += mesh.positions.length / 3;
  return total;
}

/**
 * Draw `job` here when it is small enough not to freeze the page
 * ({@link MAIN_THREAD_MAX_VERTICES}); a larger one is refused with an error
 * that says why, and the view shows that it could not be drawn.
 */
export function drawOnMainThreadIfSmall(job: GenerateJob, outlineFn: MeshOutline2dFn | undefined, onProgress: ProgressFn | undefined, why: string): Promise<Drawing2D> {
  const vertices = verticesOf(job.meshes);
  if (vertices > MAIN_THREAD_MAX_VERTICES) {
    return Promise.reject(new Error(`This view could not be drawn: ${why}, and at ${vertices.toLocaleString('en')} vertices it is too large to draw on the page without freezing it.`));
  }
  return drawOnMainThread(job, outlineFn, onProgress);
}

/** Draw `job` on this thread after the views queued before it, with a turn of the event loop first. */
export function drawOnMainThread(job: GenerateJob, outlineFn: MeshOutline2dFn | undefined, onProgress?: ProgressFn): Promise<Drawing2D> {
  setWaiting(waiting + 1);
  const run = runner;
  const turn = queue.then(async () => {
    await betweenViews();
    return run(job, outlineFn, onProgress);
  });
  queue = turn.then(() => undefined, () => undefined);
  return turn.finally(() => setWaiting(waiting - 1));
}

/** Tests only: what draws a view here (null restores `runGenerateJob`). */
export function __setMainThreadRunnerForTest(next: Runner | null): void {
  runner = next ?? runGenerateJob;
}
