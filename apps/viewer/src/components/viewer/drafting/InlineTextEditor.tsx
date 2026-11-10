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
  /**
   * `above`: centred on `at`, hanging under it (over a selected annotation). `start`: its lower left corner on `at`, where a new
   * text starts. `after` / `before`: centred on `at` vertically, starting to its right / ending to its left, where a Note's words
   * print beside the end of its leader.
   */
  placement?: 'above' | 'start' | 'after' | 'before';
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
  /** Empty words are not an answer: Enter does nothing while the box is empty, and leaving it empty cancels instead of committing. */
  requireText?: boolean;
}

const BOX = 'absolute z-30 min-w-48 cursor-text rounded-md border-2 border-primary bg-white px-2 text-sm text-zinc-900 shadow-lg outline-none';

export function InlineTextEditor({ value, at, placement = 'above', multiline, label, onCommit, onCancel, opensOnPress = false, requireText = false }: InlineTextEditorProps) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const settled = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    if (requireText && !textRef.current.trim()) cancelRef.current();
    else commitRef.current(textRef.current);
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    cancelRef.current();
  };
  useEffect(() => {
    const focus = () => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (opensOnPress) el.setSelectionRange(el.value.length, el.value.length);
      else el.select();
    };
    if (!opensOnPress) {
      focus();
      return;
    }
    let focused = false;
    const setBoth = (next: string) => { textRef.current = next; setText(next); };
    // The keys typed between the click that placed the box and the focus it takes once that press is over (a slow machine
    // makes that gap long) are kept, not lost to the page: they go in the box as if it had the focus.
    const early = (e: KeyboardEvent) => {
      if (focused || (e.target instanceof Node && ref.current?.contains(e.target)) || e.ctrlKey || e.metaKey || e.altKey) return;
      const eat = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === 'Escape') { eat(); cancel(); }
      else if (e.key === 'Enter' && !e.shiftKey) {
        eat();
        if (!requireText || textRef.current.trim()) commit();
      } else if (e.key === 'Enter') { eat(); setBoth(`${textRef.current}\n`); }
      else if (e.key === 'Backspace') { eat(); setBoth(textRef.current.slice(0, -1)); }
      else if (e.key.length === 1) { eat(); setBoth(textRef.current + e.key); }
    };
    document.addEventListener('keydown', early, true);
    const timer = setTimeout(() => {
      focused = true;
      document.removeEventListener('keydown', early, true);
      focus();
    }, 0);
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      commit();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', early, true);
      document.removeEventListener('pointerdown', outside, true);
    };
    // Mount only: the box opens once, and commit reads the latest text through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = placement === 'start' ? { left: at.x, top: at.y }
    : placement === 'after' ? { left: at.x + 3, top: at.y }
    : placement === 'before' ? { left: at.x - 3, top: at.y }
    : { left: at.x, top: at.y + 4 };
  const place = { start: '-translate-y-full', above: '-translate-x-1/2', after: '-translate-y-1/2', before: '-translate-x-full -translate-y-1/2' }[placement];
  const shared = {
    'aria-label': label,
    className: `${BOX} ${place}`,
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
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!requireText || text.trim()) commit(); }
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
        if (e.key === 'Enter' && (!requireText || text.trim())) commit();
        if (e.key === 'Escape') cancel();
      }}
    />
  );
}
