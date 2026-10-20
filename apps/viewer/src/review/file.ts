/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the comments of a project file. A comment is a reviewer's words, so
 * a damaged one is dropped on its own rather than refusing the whole project;
 * a field that is not the right kind makes only that comment unreadable.
 */

import type { CommentReply, ReviewComment } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';
/** An optional string field, kept only when it is a non-empty string. */
const opt = <K extends string>(key: K, v: unknown): { [k in K]?: string } => (str(v) && v ? { [key]: v } as { [k in K]: string } : {});

function readReply(v: unknown): CommentReply[] {
  if (!isObject(v) || !str(v.id) || !str(v.text)) return [];
  return [{ id: v.id, author: str(v.author) ? v.author : '', createdAt: isNumber(v.createdAt) ? v.createdAt : 0, text: v.text, ...opt('bcfGuid', v.bcfGuid) }];
}

function readComment(v: unknown): ReviewComment[] {
  if (!isObject(v) || !str(v.id) || !str(v.sheetId) || !str(v.text) || !isNumber(v.x) || !isNumber(v.y)) return [];
  const point = isObject(v.point) && isNumber(v.point.x) && isNumber(v.point.y) ? { x: v.point.x, y: v.point.y } : undefined;
  return [{
    id: v.id, sheetId: v.sheetId, x: v.x, y: v.y,
    ...(str(v.viewportId) ? { viewportId: v.viewportId } : {}),
    ...(str(v.viewId) ? { viewId: v.viewId } : {}),
    ...(point ? { point } : {}),
    ...(str(v.elementGuid) && v.elementGuid ? { elementGuid: v.elementGuid } : {}),
    author: str(v.author) ? v.author : '',
    createdAt: isNumber(v.createdAt) ? v.createdAt : 0,
    status: v.status === 'done' ? 'done' : 'open',
    text: v.text,
    replies: Array.isArray(v.replies) ? v.replies.flatMap(readReply) : [],
    ...opt('bcfGuid', v.bcfGuid),
    ...opt('bcfViewpointGuid', v.bcfViewpointGuid),
  }];
}

/** `comments` of a project file; absent in one saved before review existed. */
export function readComments(raw: unknown): ReviewComment[] {
  return Array.isArray(raw) ? raw.flatMap(readComment) : [];
}
