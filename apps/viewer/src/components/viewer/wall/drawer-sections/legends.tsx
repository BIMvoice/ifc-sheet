/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation } from '@/i18n';
import { hangLegend } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import { sheetsShowing } from '@/project/sheets';
import { LegendsAdd } from '../LegendsAdd';
import { Group, Row } from './parts';
import type { DrawerContext, DrawerSection } from './types';

function Legends({ go, onClose }: DrawerContext) {
  const { t } = useTranslation();
  const legends = useProjectStore((s) => s.legends ?? []);
  return (
    <div data-owns-keys>
      <Group title={t('wall.group.legends')} add={<LegendsAdd onClose={onClose} />}>
        {legends.map((l) => <Row key={l.id} id={l.id} label={l.name} onOpen={() => go(sheetsShowing(l.id)[0]?.id ?? hangLegend(l.id))} />)}
      </Group>
    </div>
  );
}

/** The legends. */
export const legendsSection: DrawerSection = { id: 'legends', slot: 'body', order: 1100, component: Legends };
