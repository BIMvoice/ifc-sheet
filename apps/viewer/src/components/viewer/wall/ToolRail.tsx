/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rail beside a stepped-into sheet: six large tools that only add
 * information, and "Add a drawing".
 */

import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { ToolIcon } from '../ifcsheet/ToolIcon';
import { WALL_TOOLS } from './wall-actions';

interface ToolRailProps {
  active: string | null;
  onTool: (command: string) => void;
  adding: boolean;
  onAdd: () => void;
}

export function ToolRail({ active, onTool, adding, onAdd }: ToolRailProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('wall.tools.rail')} className="flex w-[132px] shrink-0 flex-col gap-2 overflow-y-auto py-2">
      {WALL_TOOLS.map((tool) => {
        const on = active === tool.command;
        return (
          <button
            key={tool.command}
            type="button"
            aria-pressed={on}
            onClick={() => onTool(tool.command)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-[15px] transition-colors',
              on ? 'border-sky-400 bg-sky-500 text-white' : 'border-sky-300/20 bg-[#0d2a55] text-sky-50 hover:border-sky-300/60',
            )}
          >
            <ToolIcon name={tool.icon} size={44} accent={on ? '#0b1f3d' : '#22d3ee'} />
            {t(tool.labelKey)}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={adding}
        onClick={onAdd}
        className={cn(
          'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-[15px] leading-tight',
          adding ? 'border-cyan-300 bg-cyan-400 text-[#0b1f3d]' : 'border-cyan-400/60 text-cyan-300 hover:bg-cyan-400/10',
        )}
      >
        <ToolIcon name="plus" size={22} accent="currentColor" />
        {t('wall.addDrawing')}
      </button>
    </nav>
  );
}
