/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How the viewport opens files a user chose: DXF underlays split off, the
 * models (and their sidecars) routed together, anything else reported by
 * name. The viewport's own picker calls it, and so does `ifc-lite:load-files`,
 * which the start page sends when it is given several IFC files at once
 * (#863): they open as one set, as they did through the window's drop
 * handler before the start page claimed the drop.
 */

import { useCallback, useEffect } from 'react';
import { ingestDxfFiles, splitDxfFiles } from '@/hooks/ingest/dxfIngest';
import { reportFileOpenRejected } from '@/hooks/ingest/fileOpenRejected';
import { isModelSidecarFile, isSupportedModelFile } from '@/services/supported-model-files';
import { EVENT_LOAD_FILES } from './open-model-files-event';

/**
 * `route` receives the supported files together; `guard` returns false (and
 * keeps `retry` for later) while the browser cannot open a model yet.
 * Returns the opener; while mounted it also answers `ifc-lite:load-files`.
 */
export function useOpenModelFiles(
  route: (files: File[]) => void,
  guard: (retry?: () => void) => boolean,
): (files: File[]) => void {
  const open = useCallback((files: File[]) => {
    const attempt = () => {
      if (!guard(attempt)) return;
      // DXF reference underlays split off before model routing (issue #1782).
      const { dxfFiles, modelFiles } = splitDxfFiles(files);
      if (dxfFiles.length > 0) void ingestDxfFiles(dxfFiles);
      // Filter to supported files (IFC, IFCX, GLB). These come without a live
      // file handle, so the models are not refreshable.
      const supportedFiles = modelFiles.filter((file) => isSupportedModelFile(file) || isModelSidecarFile(file));
      if (supportedFiles.length > 0) route(supportedFiles);
      else reportFileOpenRejected(modelFiles);
    };
    attempt();
  }, [route, guard]);

  useEffect(() => {
    const handler = (e: Event) => {
      const files = (e as CustomEvent<unknown>).detail;
      if (Array.isArray(files) && files.length > 0 && files.every((f) => f instanceof File)) open(files);
    };
    window.addEventListener(EVENT_LOAD_FILES, handler);
    return () => window.removeEventListener(EVENT_LOAD_FILES, handler);
  }, [open]);

  return open;
}
