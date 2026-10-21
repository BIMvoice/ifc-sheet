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
  /** The GUID this reply has as a BCF comment: given on its first export and kept, so another BCF tool sees the same comment again. */
  bcfGuid?: string;
}

/**
 * What a BCF topic from another tool says that a comment has no field of its
 * own for, kept so the topic goes back to that tool as it came: its title
 * (when it is not just the first line of the text), type (when not Issue),
 * priority, assignee and labels (its own, not the `sheet:` and
 * `ifcsheet-comment:` labels this tool adds).
 */
export interface BcfTopicFields {
  title?: string;
  topicType?: string;
  priority?: string;
  assignedTo?: string;
  labels?: string[];
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
  /** The GUID of the BCF topic this comment is (given on its first export, or the topic's own when it came from a BCF file), and of its viewpoint; kept so a later export updates that topic instead of adding another. */
  bcfGuid?: string;
  bcfViewpointGuid?: string;
  /** The topic's own fields, from the BCF file it came from or was last updated by; written back on export. */
  bcfTopic?: BcfTopicFields;
}
