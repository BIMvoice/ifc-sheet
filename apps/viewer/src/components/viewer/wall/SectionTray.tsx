/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tray under a sheet of sections: the sections the model suggests, named
 * after what they pass through. Picking one shows it in the chosen slot; the
 * section and its symbol on the plan are made the first time it is picked.
 */

import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { sectionForProposal, swapViewportView } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import type { SectionProposal } from '@/project/section-proposals';
import type { ProjectSheet } from '@/project/types';

export function SectionTray({ sheet, slotId, proposals }: { sheet: ProjectSheet; slotId: string | null; proposals: readonly SectionProposal[] }) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const placed = new Set((sheet.viewports ?? []).map((vp) => vp.viewId));
  const onSheet = (p: SectionProposal) => views.some((v) => v.kind === 'section' && v.through === p.label && placed.has(v.id));
  if (proposals.length === 0) return null;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-sky-300/20 bg-sky-950/60 px-5 py-3">
      <span className="max-w-[9rem] text-2xs font-medium uppercase leading-relaxed tracking-[0.2em] text-sky-200/70">{t('wall.tray')}</span>
      <div className="flex flex-wrap gap-2">
        {proposals.map((p) => {
          const shown = onSheet(p);
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={shown}
              disabled={!slotId || shown}
              title={slotId ? undefined : t('wall.pickSlot')}
              onClick={() => {
                const viewId = slotId ? sectionForProposal(p) : null;
                if (slotId && viewId) swapViewportView(sheet.id, slotId, viewId);
              }}
              className={cn(
                'relative rounded-lg border px-4 py-3 text-sm transition-colors',
                shown ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-sky-300/30 text-sky-100 hover:border-sky-300/80 disabled:opacity-50',
              )}
            >
              {p.label}
              {shown ? <span className="absolute -top-2 right-2 rounded-full bg-sky-500 px-2 text-2xs text-white">{t('wall.inSheet')}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
