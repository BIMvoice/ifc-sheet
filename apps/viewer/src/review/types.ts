/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Review on the Wall: a comment is pinned on a point of a sheet, in paper
 * millimetres, so it stays where the reviewer put it however the sheet is
 * viewed. When the point lies on a drawing, the drawing, the point in it (the
 * view's own metres) and the model element under it are kept as well; those
 * are what a BCF topic is made of.
 */

export type CommentStatus = 'open' | 'done';

export interface CommentReply {
  id: string;
  author: string;
  createdAt: number;
  text: string;
}

export interface ReviewComment {
  id: string;
  sheetId: string;
  /** Where the pin sits on the paper, mm from its top-left corner. */
  x: number;
  y: number;
  /** The sheet viewport under the pin, and the view it shows. */
  viewportId?: string;
  viewId?: string;
  /** The point under the pin in that view's drawing space, metres. */
  point?: { x: number; y: number };
  /** IFC GlobalId of the model element under the pin. */
  elementGuid?: string;
  author: string;
  createdAt: number;
  status: CommentStatus;
  text: string;
  replies: CommentReply[];
}
