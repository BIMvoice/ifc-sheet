/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ribbon · Design tab — drafting and (later) modeling tools that work on
 * the view in front: draw, modify and edit commands, plus snap / ortho.
 * The buttons are the registered `design:*` commands
 * (`surface-commands-design-ribbon.ts`).
 */

import {
  AnnoAxis, DraftArc, DraftCircle, DraftCopy, DraftErase, DraftExtend, DraftFillet, DraftLine, DraftMirror, DraftMove,
  DraftOffset, DraftOrtho, DraftPolyline, DraftRectangle, DraftRotate, DraftSectionLine, DraftSnap, DraftTrim, DraftWorkplane, DraftExtrude,
  BuildingMaterials, JoinAuto, JoinButt, JoinMitre, JoinSwap, GroupMake, GroupUngroup, GroupEdit, GroupSelect, MoveToStorey, DoorFlipHand, JoineryTypes, ElementTypes, RoofSystem, DoorFlipSide, CutPriority,
  DraftSweep, DraftRevolve, BimRoof, BimBeam, BimColumn, BimCurtainWall, BimDoor, BimGrid, BimOpening, BimRailing, BimRoom, BimSlab, BimStair, BimWall, BimWindow,
} from '@/icons';
import { useTranslation } from '@/i18n';
import { useDraftingSession } from '@/drafting/session';
import { useDrafting3dPref } from '@/lib/drafting-3d-prefs';
import { RibbonGroup, RibbonGroupDivider, RibbonSmallStack } from '../primitives';
import { RibbonCommandLargeButton, RibbonCommandSmallButton } from '../command-button';

export function DesignTab() {
  const { t } = useTranslation();
  const commandId = useDraftingSession((s) => s.commandId);
  const snap = useDraftingSession((s) => s.snap);
  const ortho = useDraftingSession((s) => s.ortho);
  const on = (id: string) => commandId === id;
  const drafting3d = useDrafting3dPref((s) => s.show);

  return (
    <>
      <RibbonGroup label={t('drafting.group.draw')}>
        <RibbonCommandLargeButton commandId="design:line" icon={DraftLine} active={on('line')} />
        <RibbonCommandLargeButton commandId="design:polyline" icon={DraftPolyline} active={on('polyline')} />
        <RibbonCommandLargeButton commandId="design:rectangle" icon={DraftRectangle} active={on('rectangle')} />
        <RibbonCommandLargeButton commandId="design:circle" icon={DraftCircle} active={on('circle')} />
        <RibbonCommandLargeButton commandId="design:arc" icon={DraftArc} active={on('arc')} />
        <RibbonCommandLargeButton commandId="annotate:axis" icon={AnnoAxis} active={on('axis')} />
      </RibbonGroup>
      <RibbonGroupDivider />
      <RibbonGroup label={t('drafting.group.modify')}>
        <RibbonCommandLargeButton commandId="design:move" icon={DraftMove} active={on('move')} />
        <RibbonCommandLargeButton commandId="design:copy" icon={DraftCopy} active={on('copy')} />
        <RibbonSmallStack>
          <RibbonCommandSmallButton commandId="design:rotate" icon={DraftRotate} active={on('rotate')} />
          <RibbonCommandSmallButton commandId="design:mirror" icon={DraftMirror} active={on('mirror')} />
          <RibbonCommandSmallButton commandId="design:erase" icon={DraftErase} active={on('erase')} />
        </RibbonSmallStack>
      </RibbonGroup>
      <RibbonGroupDivider />
      <RibbonGroup label={t('drafting.group.edit')}>
        <RibbonCommandLargeButton commandId="design:offset" icon={DraftOffset} active={on('offset')} />
        <RibbonSmallStack>
          <RibbonCommandSmallButton commandId="design:trim" icon={DraftTrim} active={on('trim')} />
          <RibbonCommandSmallButton commandId="design:extend" icon={DraftExtend} active={on('extend')} />
          <RibbonCommandSmallButton commandId="design:fillet" icon={DraftFillet} active={on('fillet')} />
        </RibbonSmallStack>
      </RibbonGroup>
      <RibbonGroupDivider />
      {/* The docs edition: the joinery configurator as the symbol library for the model's doors and windows. */}
      <RibbonGroup label={t('drafting.group.symbols')}>
        <RibbonCommandLargeButton commandId="design:joinery" icon={JoineryTypes} />
      </RibbonGroup>
      <RibbonGroupDivider />
      <RibbonGroup label={t('drafting.group.workplane')}>
        <RibbonCommandLargeButton commandId="design:section-line" icon={DraftSectionLine} active={on('sectionline')} />
        <RibbonCommandLargeButton commandId="design:workplane-face" icon={DraftWorkplane} />
      </RibbonGroup>
      <RibbonGroupDivider />
      <RibbonGroup label={t('drafting.group.aids')}>
        <RibbonSmallStack>
          <RibbonCommandSmallButton commandId="design:snap" icon={DraftSnap} active={snap} />
          <RibbonCommandSmallButton commandId="design:ortho" icon={DraftOrtho} active={ortho} />
          <RibbonCommandSmallButton commandId="design:drafting-3d" icon={DraftLine} active={drafting3d} />
        </RibbonSmallStack>
      </RibbonGroup>
    </>
  );
}
