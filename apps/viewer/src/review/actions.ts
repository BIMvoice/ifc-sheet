/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Comments in the project: add, answer, close and reopen. They live in the
 * project document (`ProjectDocument.comments`) so they are saved and
 * reopened with it.
 */

import { freshProjectId } from '@/project/view-defaults';
import { useProjectStore } from '@/project/project-store';
import type { ReviewComment } from './types';

export type NewComment = Omit<ReviewComment, 'id' | 'createdAt' | 'status' | 'replies'> & Partial<Pick<ReviewComment, 'id' | 'createdAt'>>;

function patch(id: string, change: (c: ReviewComment) => ReviewComment): void {
  const state = useProjectStore.getState();
  const list = state.comments ?? [];
  if (!list.some((c) => c.id === id)) return;
  useProjectStore.setState({ comments: list.map((c) => (c.id === id ? change(c) : c)), dirty: true });
}

export function addComment(input: NewComment): string {
  const id = input.id ?? freshProjectId('comment');
  const comment: ReviewComment = { ...input, id, createdAt: input.createdAt ?? Date.now(), status: 'open', replies: [] };
  useProjectStore.setState((s) => ({ comments: [...(s.comments ?? []), comment], dirty: true }));
  return id;
}

export function setCommentStatus(id: string, status: ReviewComment['status']): void {
  patch(id, (c) => ({ ...c, status }));
}

export function replyToComment(id: string, author: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  patch(id, (c) => ({ ...c, replies: [...c.replies, { id: freshProjectId('reply'), author, createdAt: Date.now(), text: trimmed }] }));
}

export function removeComment(id: string): void {
  useProjectStore.setState((s) => ({ comments: (s.comments ?? []).filter((c) => c.id !== id), dirty: true }));
}

/** The comments pinned on one sheet, oldest first. */
export function commentsOfSheet(comments: readonly ReviewComment[], sheetId: string): ReviewComment[] {
  return comments.filter((c) => c.sheetId === sheetId);
}

export function openCount(comments: readonly ReviewComment[], sheetId?: string): number {
  return comments.filter((c) => c.status === 'open' && (sheetId === undefined || c.sheetId === sheetId)).length;
}
