/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rail beside a stepped-into sheet: six large tools that only add
 * information, "Add a drawing", and below them a smaller set for plain
 * drawing (lines, polylines, circles, text, a hatched zone), and the Ortho
 * lock that holds every point to horizontal or vertical (F8; Ctrl holds it).
 */

import { useTranslation } from '@/i18n';
import { toggleTracking, useTrackingPref } from '@/drafting/tracking-pref';
import { currentLayerId, setCurrentLayer, toggleOrtho, useDraftingSession } from '@/drafting/session';
import { useProjectStore } from '@/project/project-store';
import { openStandards } from '@/project/standards-dialog-store';
import { TOUR_ANCHORS, tourAnchor } from '@/lib/tours/anchors';
import { cn } from '@/lib/utils';
import { ToolIcon } from '../ifcsheet/ToolIcon';
import { ArrowRightToLine, Braces, Circle, Cloud, CornerUpRight, Pencil, EyeOff, PaintBucket, Scissors, Slash, Slice, Spline, Square, SquareStack, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProjectView } from '@/project/types';
import { toolHelpKey } from './tool-help';
import { wallToolKey } from '@/lib/commands/wall-key-commands';
import { EDIT_TOOLS, PLAIN_DRAW_TOOLS, WALL_ALL, WALL_TOOLS, type DrawTool } from './wall-actions';
import { shortcutLabel } from '@/lib/commands/shortcut-label';
import { keyProps } from './wall-key-title';
import { useKeyBindingsRevision } from '@/lib/commands/key-bindings';

const DRAW_ICONS: Record<string, ReactNode> = {
  line: <Slash className="size-4" />, polyline: <Spline className="size-4" />, rectangle: <Square className="size-4" />, circle: <Circle className="size-4" />,
  text: <Type className="size-4" />, hatch: <PaintBucket className="size-4" />, revcloud: <Cloud className="size-4" />, pen: <Pencil className="size-4" />, ptext: <Braces className="size-4" />,
  trim: <Scissors className="size-4" />, extend: <ArrowRightToLine className="size-4" />, fillet: <CornerUpRight className="size-4" />, offset: <SquareStack className="size-4" />, chamfer: <Slice className="size-4" />, hideline: <EyeOff className="size-4" />,
};

interface ToolRailProps {
  active: string | null;
  /** The tool used last, marked with a dashed border while no tool runs, so a repeat is a visible click (#168). */
  last?: string | null;
  onTool: (command: string) => void;
  adding: boolean;
  onAdd: () => void;
  /** The kind of the drawing the tools would work on, for the one-action offers under them. */
  viewKind: ProjectView['kind'] | null;
  onAll: (command: string) => void;
}

export function ToolRail({ active, last = null, onTool, adding, onAdd, viewKind, onAll }: ToolRailProps) {
  const { t } = useTranslation();
  const ortho = useDraftingSession((o) => o.ortho);
  const tracking = useTrackingPref((o) => o.on);
  useDraftingSession((o) => o.revision); // the current layer is session state outside the store
  const layers = useProjectStore((p) => p.draftLayers);
  useKeyBindingsRevision(); // a rebinding or preset switch redraws the keys the tools name
  const orthoKeys = shortcutLabel('drafting.ortho');
  /** The tooltip: the tool's help line and its key from the keymap; a tool the keymap does not know keeps the bare line and announces no key. */
  const keyed = (name: string, command: string): { title: string; 'aria-keyshortcuts'?: string } => {
    const id = wallToolKey(command);
    return id ? keyProps(t, name, id) : { title: name };
  };
  /**
   * A list of tools: the plain drawing ones, or the edit ones. One tool to a row, icon then name: two to a row left each
   * name 48 px, and "Rectangle", "Parameter text" and most Romanian names need more, so they were cut at the rail's edge.
   */
  const toolGrid = (tools: readonly DrawTool[]) => (
    <div className="flex flex-col gap-1">
      {tools.map((tool) => {
        const on = active === tool.command;
        return (
          <button
            key={tool.command}
            type="button"
            aria-pressed={on}
            data-last-tool={!on && last === tool.command ? '' : undefined}
            {...keyed(t(toolHelpKey(tool.command)), tool.command)}
            onClick={() => onTool(tool.command)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-xs leading-tight [&>svg]:shrink-0',
              on ? 'border-sky-400 bg-sky-500 text-white' : last === tool.command ? 'border-dashed border-sky-300/80 text-sky-100' : 'border-sky-300/20 text-sky-100 hover:border-sky-300/60',
            )}
          >
            {DRAW_ICONS[tool.command]}
            {/* A name longer than the row wraps, and a single word longer than it breaks: it is never cut. */}
            <span className="min-w-0 break-words">{t(tool.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <nav aria-label={t('wall.tools.rail')} {...tourAnchor(TOUR_ANCHORS.wallToolRail)} className="flex w-[116px] shrink-0 flex-col gap-1.5 overflow-y-auto py-1 [scrollbar-width:thin]">
      {WALL_TOOLS.map((tool) => {
        const on = active === tool.command;
        const all = WALL_ALL[tool.command];
        return (
          <div key={tool.command} className="flex flex-col gap-1">
            <button
              type="button"
              aria-pressed={on}
              data-last-tool={!on && last === tool.command ? '' : undefined}
              {...keyed(t(toolHelpKey(tool.command)), tool.command)}
              onClick={() => onTool(tool.command)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl border px-2 py-1 text-xs transition-colors',
                on ? 'border-sky-400 bg-sky-500 text-white' : last === tool.command ? 'border-dashed border-sky-300/80 bg-[#0d2a55] text-sky-50' : 'border-sky-300/20 bg-[#0d2a55] text-sky-50 hover:border-sky-300/60',
              )}
            >
              <ToolIcon name={tool.icon} size={28} accent={on ? '#0b1f3d' : '#22d3ee'} />
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
          'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs leading-tight',
          adding ? 'border-cyan-300 bg-cyan-400 text-[#0b1f3d]' : 'border-cyan-400/60 text-cyan-300 hover:bg-cyan-400/10',
        )}
      >
        <ToolIcon name="plus" size={18} accent="currentColor" />
        {t('wall.addDrawing')}
      </button>
      <p className="m-0 mt-2 text-2xs font-medium uppercase tracking-widest text-sky-300/70">{t('wall.draw')}</p>
      {toolGrid(PLAIN_DRAW_TOOLS)}
      <p className="m-0 mt-2 text-2xs font-medium uppercase tracking-widest text-sky-300/70">{t('wall.edit')}</p>
      {toolGrid(EDIT_TOOLS)}
      <button
        type="button"
        aria-pressed={ortho}
        aria-label={t('wall.ortho.aria')}
        {...keyProps(t, t('wall.ortho.help'), 'drafting.ortho')}
        onClick={toggleOrtho}
        className={cn(
          'flex items-center justify-between gap-2 rounded-xl border px-3 py-1 text-xs leading-tight',
          ortho ? 'border-sky-400 bg-sky-500 text-white' : 'border-sky-300/20 text-sky-100 hover:border-sky-300/60',
        )}
      >
        {t('drafting.ortho')}
        {orthoKeys ? <kbd className="rounded border border-current/40 px-1 text-xs opacity-80">{orthoKeys}</kbd> : null}
      </button>
      <button
        type="button"
        // A setting kept between sessions, not a tool or a lock that is held: a switch, so it is not read as a pressed tool.
        role="switch"
        aria-checked={tracking}
        // No tooltip: the rail's tooltips name a key, and tracking has none (F11, AutoCAD's key, is the browser's full screen).
        aria-label={`${t('tracking.toggle')}: ${t('tracking.hint')}`}
        onClick={toggleTracking}
        className={cn(
          'flex items-center justify-between gap-2 rounded-xl border px-3 py-1 text-xs leading-tight',
          tracking ? 'border-sky-400 bg-sky-500 text-white' : 'border-sky-300/20 text-sky-100 hover:border-sky-300/60',
        )}
      >
        {t('tracking.toggle')}
      </button>
      <label className="mt-1 flex flex-col gap-0.5 text-xs text-sky-100">
        {t('drafting.layer')}
        <select
          aria-label={t('drafting.layer')}
          value={currentLayerId()}
          onChange={(e) => setCurrentLayer(e.target.value)}
          className="h-7 rounded-md border border-sky-300/20 bg-[#0d2a55] px-1 text-xs text-sky-50"
        >
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <button
        type="button"
        onClick={() => openStandards('layers')}
        className="rounded-xl border border-sky-300/20 px-2 py-1 text-xs leading-tight text-sky-100 hover:border-sky-300/60"
      >
        {t('drafting.card.editors')}
      </button>
    </nav>
  );
}
