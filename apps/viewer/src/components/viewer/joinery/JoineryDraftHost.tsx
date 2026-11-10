/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A joinery schedule's front, plan or section of one type, drawn on from inside a sheet (#656): the schedule's own data and views, handed
 * to `JoineryViewDrafting`, the view the schedule tab draws on. No second editor; this only finds what that view is given.
 *
 * A line drawn changes the type, so the schedule's data changes and its views are cut again; until they are, the views the drawing was
 * opened with stay in front. Taking the view away while it is being cut would close it and open it again under the user's hand.
 */

import { useRef } from 'react';
import { useProjectStore } from '@/project/project-store';
import type { JoineryViewName } from '@bimvoice/ifcsheet/project';
import { joineryDraftSource, type JoineryDraftSource } from './joinery-draft-source';
import { JoineryViewDrafting } from './JoineryViewDrafting';
import { useScheduleLayout } from './ScheduleGraphic';

/** `name` is what the sheet calls the view while it is in front (the type's mark and the view). */
export interface JoineryDraft { scheduleId: string; typeId: string; view: JoineryViewName; name: string }

export function JoineryDraftHost({ draft, onDone }: { draft: JoineryDraft; onDone: () => void }) {
  const schedule = useProjectStore((s) => s.schedules?.find((x) => x.id === draft.scheduleId));
  const result = useScheduleLayout(schedule);
  const last = useRef<JoineryDraftSource | null>(null);
  const current = result ? joineryDraftSource(result, draft.typeId) : null;
  if (current) last.current = current;
  const source = current ?? last.current;
  if (!schedule || !source) return null;
  return <JoineryViewDrafting spec={source.spec} view={draft.view} views={source.views} scale={schedule.scale ?? 50} onDone={onDone} />;
}
