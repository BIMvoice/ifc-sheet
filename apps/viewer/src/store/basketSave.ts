/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useViewerStore } from './index.js';
import { getGlobalRenderer } from '../hooks/useBCF.js';

type BasketViewSource = 'selection' | 'visible' | 'hierarchy' | 'manual';

interface SelectionSnapshot {
  selectedEntityId: number | null;
  selectedEntityIds: Set<number>;
  selectedEntity: ReturnType<typeof useViewerStore.getState>['selectedEntity'];
  selectedEntitiesSet: Set<string>;
  selectedEntities: ReturnType<typeof useViewerStore.getState>['selectedEntities'];
  selectedModelId: string | null;
  chartOwned: boolean;
  selectionRevision: number;
}

function hasSelection(snapshot: SelectionSnapshot): boolean {
  return (
    snapshot.selectedEntityId !== null ||
    snapshot.selectedEntityIds.size > 0 ||
    snapshot.selectedEntity !== null ||
    snapshot.selectedEntitiesSet.size > 0 ||
    snapshot.selectedEntities.length > 0
  );
}

function snapshotSelectionState(): SelectionSnapshot {
  const state = useViewerStore.getState();
  return {
    selectedEntityId: state.selectedEntityId,
    selectedEntityIds: new Set(state.selectedEntityIds),
    selectedEntity: state.selectedEntity ? { ...state.selectedEntity } : null,
    selectedEntitiesSet: new Set(state.selectedEntitiesSet),
    selectedEntities: state.selectedEntities.map((ref) => ({ ...ref })),
    selectedModelId: state.selectedModelId,
    chartOwned: state.chartSelectionRevision != null
      && state.chartSelectionRevision === state.selectionRevision,
    selectionRevision: state.selectionRevision,
  };
}

function restoreSelectionState(snapshot: SelectionSnapshot): void {
  useViewerStore.setState({
    selectedEntityId: snapshot.selectedEntityId,
    selectedEntityIds: new Set(snapshot.selectedEntityIds),
    selectedEntity: snapshot.selectedEntity ? { ...snapshot.selectedEntity } : null,
    selectedEntitiesSet: new Set(snapshot.selectedEntitiesSet),
    selectedEntities: snapshot.selectedEntities.map((ref) => ({ ...ref })),
    selectedModelId: snapshot.selectedModelId,
    selectionRevision: snapshot.selectionRevision,
    ...(snapshot.chartOwned
      ? { chartSelectionRevision: snapshot.selectionRevision }
      : {}),
  });
}

/** Hide the outline for capture without publishing a new selection write. */
function temporarilyClearSelectionState(): void {
  useViewerStore.setState({
    selectedEntity: null,
    selectedEntitiesSet: new Set(),
    selectedEntities: [],
    selectedEntityId: null,
    selectedEntityIds: new Set(),
    selectedModelId: null,
  });
}

async function captureCanvasThumbnail(): Promise<string | null> {
  const src = document.querySelector('canvas[data-viewport="main"]') as HTMLCanvasElement | null;
  if (!src) return null;

  // Ensure submitted GPU work is complete before sampling the canvas.
  const renderer = getGlobalRenderer();
  const device = renderer?.getGPUDevice();
  if (device) {
    await device.queue.onSubmittedWorkDone();
  }

  // FRAME-WAIT-ALLOW(#2385): must NOT be raced against a timer — the point is
  // that the frame was presented before `toDataURL()` samples the canvas, and
  // timing out would save a stale or blank basket thumbnail. A hidden tab
  // cannot present a frame at all, so bounding this buys nothing.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

  try {
    // Capture from the WebGPU canvas first (reliable), then downscale.
    const fullFrameDataUrl = src.toDataURL('image/png');

    const thumb = document.createElement('canvas');
    thumb.width = 320;
    thumb.height = 180;
    const ctx = thumb.getContext('2d');
    if (!ctx) return fullFrameDataUrl;

    // Preserve viewport aspect ratio while filling thumbnail bounds (crop, no stretch).
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, thumb.width, thumb.height);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode snapshot image'));
      img.src = fullFrameDataUrl;
    });

    const srcW = img.naturalWidth || src.width || src.clientWidth;
    const srcH = img.naturalHeight || src.height || src.clientHeight;
    if (srcW <= 0 || srcH <= 0) return null;

    const scale = Math.max(thumb.width / srcW, thumb.height / srcH);
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    const offsetX = Math.floor((thumb.width - drawW) / 2);
    const offsetY = Math.floor((thumb.height - drawH) / 2);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    return thumb.toDataURL('image/jpeg', 0.75);
  } catch {
    return null;
  }
}

export async function saveBasketViewWithThumbnailFromStore(
  source: BasketViewSource = 'manual',
): Promise<string | null> {
  const before = snapshotSelectionState();
  const hadSelection = hasSelection(before);
  let clearedSelectionRevision: number | null = null;

  if (hadSelection) {
    temporarilyClearSelectionState();
    clearedSelectionRevision = useViewerStore.getState().selectionRevision;
  }

  try {
    const thumbnailDataUrl = await captureCanvasThumbnail();
    return useViewerStore.getState().saveCurrentBasketView({ source, thumbnailDataUrl });
  } finally {
    if (hadSelection && useViewerStore.getState().selectionRevision === clearedSelectionRevision) {
      restoreSelectionState(before);
    }
  }
}
