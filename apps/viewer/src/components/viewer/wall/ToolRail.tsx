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
import { Circle, Cloud, PaintBucket, Slash, Spline, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProjectView } from '@/project/types';
import { wallToolKey } from '@/lib/commands/wall-key-commands';
import { DRAW_TOOLS, WALL_ALL, WALL_TOOLS } from './wall-actions';
import { keyProps } from './wall-key-title';

const DRAW_ICONS: Record<string, ReactNode> = {
  line: <Slash className="size-5" />, polyline: <Spline className="size-5" />, circle: <Circle className="size-5" />,
  text: <Type className="size-5" />, hatch: <PaintBucket className="size-5" />, revcloud: <Cloud className="size-5" />,
};

interface ToolRailProps {
  active: string | null;
  onTool: (command: string) => void;
  adding: boolean;
  onAdd: () => void;
  /** The kind of the drawing the tools would work on, for the one-action offers under them. */
  viewKind: ProjectView['kind'] | null;
  onAll: (command: string) => void;
}

export function ToolRail({ active, onTool, adding, onAdd, viewKind, onAll }: ToolRailProps) {
  const { t } = useTranslation();
  /** The tool's name and its key from the keymap; a tool the keymap does not know keeps its bare name and announces no key. */
  const keyed = (name: string, command: string): { title: string; 'aria-keyshortcuts'?: string } => {
    const id = wallToolKey(command);
    return id ? keyProps(t, name, id) : { title: name };
  };
  return (
    <nav aria-label={t('wall.tools.rail')} className="flex w-[132px] shrink-0 flex-col gap-2 overflow-y-auto py-2">
      {WALL_TOOLS.map((tool) => {
        const on = active === tool.command;
        const all = WALL_ALL[tool.command];
        return (
          <div key={tool.command} className="flex flex-col gap-1">
            <button
              type="button"
              aria-pressed={on}
              {...keyed(t(tool.labelKey), tool.command)}
              onClick={() => onTool(tool.command)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-1.5 text-[14px] transition-colors',
                on ? 'border-sky-400 bg-sky-500 text-white' : 'border-sky-300/20 bg-[#0d2a55] text-sky-50 hover:border-sky-300/60',
              )}
            >
              <ToolIcon name={tool.icon} size={34} accent={on ? '#0b1f3d' : '#22d3ee'} />
              {t(tool.labelKey)}
            </button>
            {all && viewKind && all.kinds.includes(viewKind) ? (
              <button type="button" onClick={() => onAll(all.command)} className="px-2 text-center text-xs leading-tight text-cyan-300 underline-offset-4 hover:underline">
                {t(all.labelKey)}
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        aria-pressed={adding}
        {...keyProps(t, t('wall.addDrawing'), 'wall.addDrawing')}
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
              {...keyed(t(tool.labelKey), tool.command)}
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
