/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A sheet on the Wall: its drawn paper while it is near the screen, else a
 * blank outline of the same size with its number and name, so the Wall keeps
 * its shape and the far sheets cost nothing to draw.
 */

import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { WallSheet } from './WallSheet';

export function LazyWallSheet({ sheet, width, near }: { sheet: ProjectSheet; width: number; near: boolean }) {
  if (near) return <WallSheet sheet={sheet} width={width} deferDrawings />;
  const paper = paperOf(sheet);
  return (
    <div
      data-wall-placeholder
      className="flex flex-col items-center justify-center gap-1 border border-sky-300/30 bg-sky-100/5 px-4 text-center"
      style={{ width, height: (width * paper.h) / paper.w }}
    >
      <span className="text-base font-semibold text-white">{sheet.number}</span>
      <span className="text-sm text-sky-200/80">{sheet.name}</span>
    </div>
  );
}
