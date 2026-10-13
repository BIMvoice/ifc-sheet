/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rail beside a stepped-into sheet: six large tools that only add
 * information, "Add a drawing", and below them a smaller set for plain
 * drawing (lines, polylines, circles, text, a hatched zone).
 */

import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { ToolIcon } from '../ifcsheet/ToolIcon';
import { Circle, PaintBucket, Slash, Spline, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { DRAW_TOOLS, WALL_TOOLS } from './wall-actions';

const DRAW_ICONS: Record<string, ReactNode> = {
  line: <Slash className="size-5" />, polyline: <Spline className="size-5" />, circle: <Circle className="size-5" />,
  text: <Type className="size-5" />, hatch: <PaintBucket className="size-5" />,
};

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
              'flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-1.5 text-[14px] transition-colors',
              on ? 'border-sky-400 bg-sky-500 text-white' : 'border-sky-300/20 bg-[#0d2a55] text-sky-50 hover:border-sky-300/60',
            )}
          >
            <ToolIcon name={tool.icon} size={34} accent={on ? '#0b1f3d' : '#22d3ee'} />
            {t(tool.labelKey)}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={adding}
        onClick={onAdd}
        className={cn(
          'flex items-center gap-2 rounded-2xl border px-3 py-2 text-left text-[14px] leading-tight',
          adding ? 'border-cyan-300 bg-cyan-400 text-[#0b1f3d]' : 'border-cyan-400/60 text-cyan-300 hover:bg-cyan-400/10',
        )}
      >
        <ToolIcon name="plus" size={22} accent="currentColor" />
        {t('wall.addDrawing')}
      </button>
      <p className="m-0 mt-2 text-[11px] font-medium uppercase tracking-[0.25em] text-sky-300/70">{t('wall.draw')}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {DRAW_TOOLS.map((tool) => {
          const on = active === tool.command;
          return (
            <button
              key={tool.command}
              type="button"
              aria-pressed={on}
              onClick={() => onTool(tool.command)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 text-[11px] leading-tight',
                on ? 'border-sky-400 bg-sky-500 text-white' : 'border-sky-300/20 text-sky-100 hover:border-sky-300/60',
              )}
            >
              {DRAW_ICONS[tool.command]}
              {t(tool.labelKey)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
