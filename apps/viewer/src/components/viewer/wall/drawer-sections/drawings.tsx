/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { sheetsShowing } from '@/project/sheets';
import { hangView } from '@/project/drawing-set-actions';
import type { ProjectViewKind } from '@/project/types';
import { useViewDrawings } from '@/project/view-drawings';
import { viewportState } from '@/project/viewport-state';
import { Group, Row } from './parts';
import type { DrawerContext, DrawerSection } from './types';

const DRAWING_KINDS: { kind: Exclude<ProjectViewKind, '3d'>; labelKey: TranslationKey }[] = [
  { kind: 'plan', labelKey: 'wall.group.plans' },
  { kind: 'section', labelKey: 'wall.group.sections' },
  { kind: 'elevation', labelKey: 'wall.group.elevations' },
  { kind: 'drafting', labelKey: 'wall.group.drafting' },
];

function Drawings({ go, extent }: DrawerContext) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const byView = useViewDrawings((s) => s.byView);
  const openDrawing = (viewId: string): void => {
    const hung = sheetsShowing(viewId)[0]?.id ?? (extent ? hangView(viewId, extent) : null);
    go(hung, viewId);
  };
  return (
    <>
      {DRAWING_KINDS.map(({ kind, labelKey }) => (
        <Group key={kind} title={t(labelKey)}>
          {views.filter((v) => v.kind === kind).map((v) => <Row key={v.id} id={v.id} label={v.name} state={viewportState(byView[v.id], v.kind)} onOpen={() => openDrawing(v.id)} />)}
        </Group>
      ))}
    </>
  );
}

/** The drawings by kind: plans, sections, elevations, drafting views. */
export const drawingsSection: DrawerSection = { id: 'drawings', slot: 'body', order: 900, component: Drawings };
