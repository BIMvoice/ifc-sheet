/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The text editor that sits on the drawing: the selected annotation's text is
 * edited in it (`SelectionBar.tsx`), and a new Text or Note is written in it
 * where it prints (`OnDrawingText.tsx`, #168). Enter or leaving the box
 * commits, Shift+Enter breaks a line where the box takes several, Esc cancels.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { inputTypeOf, onTypedText } from '@/drafting/unit-superscript';
import type { Pt } from '@/drafting/types';

export interface InlineTextEditorProps {
  value: string;
  /** Screen point (px, in the drawing area) the box is placed by. */
  at: Pt;
  /** `above`: centred on `at`, hanging under it (over a selected annotation). `start`: its lower left corner on `at`, where a new text starts. */
  placement?: 'above' | 'start';
  /** A box that takes several lines (Shift+Enter) rather than one. */
  multiline: boolean;
  label: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
  /**
   * A new text, opened by the click that placed it: the box takes the focus once that press is over (taking it during the
   * press loses it again to the page), and a press anywhere outside it commits before the press does anything else.
   */
  opensOnPress?: boolean;
}

const BOX = 'absolute z-30 min-w-48 cursor-text rounded-md border-2 border-primary bg-white px-2 text-sm text-zinc-900 shadow-lg outline-none';

export function InlineTextEditor({ value, at, placement = 'above', multiline, label, onCommit, onCancel, opensOnPress = false }: InlineTextEditorProps) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const settled = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    commitRef.current(textRef.current);
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };
  useEffect(() => {
    const focus = () => { ref.current?.focus(); ref.current?.select(); };
    if (!opensOnPress) {
      focus();
      return;
    }
    const timer = setTimeout(focus, 0);
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      commit();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', outside, true);
    };
    // Mount only: the box opens once, and commit reads the latest text through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = placement === 'start' ? { left: at.x, top: at.y } : { left: at.x, top: at.y + 4 };
  const shared = {
    'aria-label': label,
    className: `${BOX} ${placement === 'start' ? '-translate-y-full' : '-translate-x-1/2'}`,
    style,
    value: text,
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
    onBlur: commit,
  };
  if (multiline) {
    return (
      <textarea
        {...shared} ref={(el) => { ref.current = el; }} rows={Math.min(Math.max(text.split('\n').length, value.split('\n').length), 6)} className={`${shared.className} py-1`}
        onChange={(e) => onTypedText(e.target, inputTypeOf(e), text, setText)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === 'Escape') cancel();
        }}
      />
    );
  }
  return (
    <input
      {...shared} ref={(el) => { ref.current = el; }} className={`${shared.className} h-8`}
      onChange={(e) => onTypedText(e.target, inputTypeOf(e), text, setText)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      }}
    />
  );
}
