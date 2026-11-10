/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words of a new Text or Note are written where they print (#168): when
 * the running command asks for them (`textAt`), the inline editor opens on the
 * drawing at that point. Enter, or a press away from it, gives the words to the
 * command as the typed line would (an empty box gives nothing: Enter waits,
 * a press away cancels); Esc cancels the command. A step's one-click answer (`shortcut`, a Note's "No bend") is a button beside its point.
 *
 * AutoCAD mode keeps the words in the command line, as typed CAD does.
 */

import { useTranslation } from '@/i18n';
import { useAutocadMode } from '@/lib/commands/autocad-mode';
import { leaderTextRight } from '@/drafting/leader-segments';
import { drawingToScreen, screenSigns, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { pressEnter, pressEscape, runningCommand, submitCommandLine, useDraftingSession } from '@/drafting/session';
import { InlineTextEditor } from './InlineTextEditor';

/**
 * The words typed go in as the typed line would. Only while the command still asks for them: a box left after the command
 * ended another way must not type into an idle line. Empty words never get here: the box does not commit them (`requireText`).
 */
function commit(text: string): void {
  if (!runningCommand()?.wantsText?.()) return;
  if (text.trim()) submitCommandLine(text, null);
}

export function OnDrawingText({ transform, axis }: { transform: ViewTransform; axis: SectionAxisName }) {
  const { t } = useTranslation();
  const autocad = useAutocadMode((s) => s.on);
  const commandId = useDraftingSession((s) => s.commandId);
  useDraftingSession((s) => s.revision);
  const command = runningCommand();
  if (autocad || !command || !commandId) return null;
  const at = command.wantsText?.() ? command.textAt?.() ?? null : null;
  const shortcut = command.shortcut?.() ?? null;
  if (at) {
    const screen = drawingToScreen(at, transform, axis);
    // A Note's words print beside the end of its leader, on the side the drawing puts them (`leaderTextRight`): the box sits there.
    const from = command.textFrom?.() ?? null;
    const placement = !from ? 'start' : leaderTextRight([from, at], screenSigns(axis).kx) ? 'after' : 'before';
    return (
      <InlineTextEditor
        key={`${commandId}:${at.x}:${at.y}`}
        value=""
        at={screen}
        placement={placement}
        multiline
        requireText
        opensOnPress
        label={t('textOnDrawing.editor')}
        onCommit={commit}
        onCancel={pressEscape}
      />
    );
  }
  if (!shortcut) return null;
  const spot = drawingToScreen(shortcut.at, transform, axis);
  return (
    <button
      type="button"
      className="absolute z-30 cursor-pointer rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-900 shadow-md hover:bg-zinc-100"
      style={{ left: spot.x + 12, top: spot.y + 12 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={pressEnter}
    >
      {t(shortcut.key)}
    </button>
  );
}
