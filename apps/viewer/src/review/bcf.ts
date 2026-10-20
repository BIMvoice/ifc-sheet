/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Comments as BCF, through the one BCF package the classic viewer uses.
 *
 * A comment whose pin lies on a model element is a topic: the element is the
 * selected component of its viewpoint, the viewpoint looks at the point under
 * the pin, the status is Open or Closed and the replies are the topic's
 * comments. A comment on bare paper has no element to be about and is not
 * exported. A topic read back is pinned on the first sheet whose drawings
 * show one of its components, at that element; one that none shows is left
 * out and counted.
 */

import {
  cameraToOrthogonal, createBCFComment, createBCFProject, createBCFTopic, generateUuid, translateViewpoint,
  type BCFComment, type BCFPoint, type BCFProject, type BCFTopic, type BCFViewpoint,
} from '@ifc-lite/bcf';
import { drawingToWorld, viewNormal } from '@/drafting/frame';
import type { ProjectSheet } from '@/project/types';
import { placeOfElement, type DrawingOf, type ElementPlace, type GuidOf } from './element-at';
import type { CommentReply, ReviewComment } from './types';

/** The label that ties a topic to the comment it came from, so reading our own file back adds nothing twice. */
const COMMENT_LABEL = 'ifcsheet-comment:';
const ORIGIN = 'IfcSheet';

export interface BcfExportOptions {
  sheets: readonly ProjectSheet[];
  drawingOf: DrawingOf;
  /** Render frame to IFC world, metres (zero near the origin). */
  worldOffset?: BCFPoint;
  projectName?: string;
}

export function exportableComments(comments: readonly ReviewComment[]): ReviewComment[] {
  return comments.filter((c) => !!c.elementGuid);
}

/**
 * The comments with the BCF GUIDs they go out with. A GUID a comment or reply
 * already has is kept; one it lacks (never exported, or saved before GUIDs
 * were kept) is given now. The caller saves the result in the project, so
 * every later export, here or after the project is reopened, sends the same
 * topic, viewpoint and comment GUIDs and the other tool updates its topic
 * instead of adding another.
 */
export function withBcfGuids(comments: readonly ReviewComment[]): { comments: ReviewComment[]; changed: boolean } {
  let changed = false;
  const out = comments.map((c) => {
    if (!c.elementGuid) return c;
    const missing = !c.bcfGuid || !c.bcfViewpointGuid || c.replies.some((r) => !r.bcfGuid);
    if (!missing) return c;
    changed = true;
    return {
      ...c, bcfGuid: c.bcfGuid || generateUuid(), bcfViewpointGuid: c.bcfViewpointGuid || generateUuid(),
      replies: c.replies.map((r) => (r.bcfGuid ? r : { ...r, bcfGuid: generateUuid() })),
    };
  });
  return { comments: out, changed };
}

function viewpointOf(c: ReviewComment, opts: BcfExportOptions): BCFViewpoint {
  const viewpoint: BCFViewpoint = {
    guid: c.bcfViewpointGuid || generateUuid(),
    components: { selection: [{ ifcGuid: c.elementGuid, originatingSystem: ORIGIN }] },
  };
  const plane = c.viewId && c.point ? opts.drawingOf(c.viewId)?.config.plane : undefined;
  if (!plane || !c.point) return viewpoint;
  // Look at the pin's point, square on to the view's plane, from the side the view is seen from.
  // A rotated section is seen along its own plane's normal, with its drawing's up (bitangent) as up.
  const target = drawingToWorld(plane, c.point);
  const normal = viewNormal(plane);
  const up = plane.customPlane ? plane.customPlane.bitangent : plane.axis === 'y' ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const eye = { x: target.x + normal.x * 10, y: target.y + normal.y * 10, z: target.z + normal.z * 10 };
  const camera = cameraToOrthogonal({ position: eye, target, up, fov: 0 }, 10);
  return translateViewpoint({ ...viewpoint, orthogonalCamera: camera }, opts.worldOffset ?? { x: 0, y: 0, z: 0 });
}

function topicOf(c: ReviewComment, opts: BcfExportOptions): BCFTopic {
  const sheet = opts.sheets.find((s) => s.id === c.sheetId);
  const title = c.text.split('\n')[0].slice(0, 120) || c.text;
  const topic = createBCFTopic({
    title, description: c.text, author: c.author, topicStatus: c.status === 'done' ? 'Closed' : 'Open',
    labels: [...(sheet ? [`sheet:${sheet.number}`] : []), `${COMMENT_LABEL}${c.id}`],
  });
  if (c.bcfGuid) topic.guid = c.bcfGuid;
  topic.creationDate = new Date(c.createdAt).toISOString();
  topic.viewpoints.push(viewpointOf(c, opts));
  topic.comments = c.replies.map((r) => ({
    ...createBCFComment({ author: r.author, comment: r.text }), ...(r.bcfGuid ? { guid: r.bcfGuid } : {}), date: new Date(r.createdAt).toISOString(),
  }));
  return topic;
}

/** The BCF project of the comments that lie on a model element (pass them through `withBcfGuids` first, and save that, for GUIDs that stay). */
export function commentsToBcf(comments: readonly ReviewComment[], opts: BcfExportOptions): BCFProject {
  const project = createBCFProject({ name: opts.projectName });
  for (const c of exportableComments(comments)) {
    const topic = topicOf(c, opts);
    project.topics.set(topic.guid, topic);
  }
  return project;
}

export interface BcfImportResult {
  /** New comments, from topics this project did not have. */
  comments: ReviewComment[];
  /** Comments already here that the file changed (replies added elsewhere, a status set elsewhere), to replace by id. */
  updated: ReviewComment[];
  /** How many of `updated` gained a reply or changed status (the rest only learnt the GUIDs they go out with). */
  merged: number;
  /** Topics that none of the sheets' drawings shows an element of. */
  unplaced: number;
  /** Topics already here exactly as the file has them. */
  known: number;
}

const closed = (status: string | undefined): boolean => /^(closed|resolved|done)$/i.test(status ?? '');

function guidsOf(topic: BCFTopic): string[] {
  return topic.viewpoints.flatMap((v) => (v.components?.selection ?? []).flatMap((c) => (c.ifcGuid ? [c.ifcGuid] : [])));
}

/**
 * A BCF date as a time. A date the file leaves out (or one that does not
 * parse) becomes the time it was read here, the earliest this project knew
 * of it, rather than 0, which a later export would write as 1970.
 */
function timeOf(date: string | undefined, readAt: number): number {
  const t = date ? Date.parse(date) : NaN;
  return Number.isFinite(t) ? t : readAt;
}

function replyOf(c: BCFComment, newId: () => string, readAt: number): CommentReply {
  return { id: newId(), author: c.author ?? '', createdAt: timeOf(c.date, readAt), text: c.comment, bcfGuid: c.guid };
}

/**
 * A comment already here, brought up to date with its topic: replies the
 * topic has and the comment lacks are added (matched by GUID; a reply kept
 * from before GUIDs were saved is matched by author and text and learns its
 * GUID), and the topic's status is taken. Null when nothing changes.
 */
function mergeTopic(c: ReviewComment, topic: BCFTopic, newId: () => string, readAt: number): { comment: ReviewComment; merged: boolean } | null {
  const replies = [...c.replies];
  let merged = false;
  let learnt = false;
  for (const bc of topic.comments) {
    if (replies.some((r) => r.bcfGuid === bc.guid)) continue;
    const same = replies.findIndex((r) => !r.bcfGuid && r.text === bc.comment && r.author === (bc.author ?? ''));
    if (same >= 0) {
      replies[same] = { ...replies[same], bcfGuid: bc.guid };
      learnt = true;
    } else {
      replies.push(replyOf(bc, newId, readAt));
      merged = true;
    }
  }
  const status = closed(topic.topicStatus) ? 'done' : 'open';
  if (status !== c.status) merged = true;
  const bcfGuid = c.bcfGuid || topic.guid;
  const bcfViewpointGuid = c.bcfViewpointGuid || topic.viewpoints[0]?.guid;
  if (bcfGuid !== c.bcfGuid || bcfViewpointGuid !== c.bcfViewpointGuid) learnt = true;
  if (!merged && !learnt) return null;
  return { comment: { ...c, status, replies, bcfGuid, ...(bcfViewpointGuid ? { bcfViewpointGuid } : {}) }, merged };
}

/**
 * The comments a BCF project's topics make on the sheets (ids are the
 * caller's to give). A topic that is a comment here already, by its GUID or
 * by the label of a comment exported from here, is merged into that comment;
 * only a topic that brings nothing new is counted as known.
 */
export function bcfToComments(
  project: BCFProject,
  existing: readonly ReviewComment[],
  opts: { sheets: readonly ProjectSheet[]; drawingOf: DrawingOf; guidOf: GuidOf; newId: () => string; readAt?: number },
): BcfImportResult {
  const readAt = opts.readAt ?? Date.now();
  const result: BcfImportResult = { comments: [], updated: [], merged: 0, unplaced: 0, known: 0 };
  for (const topic of project.topics.values()) {
    const own = topic.labels?.find((l) => l.startsWith(COMMENT_LABEL))?.slice(COMMENT_LABEL.length);
    const here = existing.find((c) => c.bcfGuid === topic.guid) ?? (own ? existing.find((c) => c.id === own) : undefined);
    if (here) {
      const change = mergeTopic(here, topic, opts.newId, readAt);
      if (!change) result.known++;
      else {
        result.updated.push(change.comment);
        if (change.merged) result.merged++;
        else result.known++;
      }
      continue;
    }
    let placed: { sheet: ProjectSheet; place: ElementPlace } | null = null;
    for (const guid of guidsOf(topic)) {
      for (const sheet of opts.sheets) {
        const place = placeOfElement(sheet, guid, opts.drawingOf, opts.guidOf);
        if (place) {
          placed = { sheet, place };
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      result.unplaced++;
      continue;
    }
    const { sheet, place } = placed;
    // The topic's GUIDs are kept, so the same file read again finds this comment instead of adding it twice.
    const viewpointGuid = topic.viewpoints[0]?.guid;
    result.comments.push({
      id: own ?? opts.newId(), sheetId: sheet.id, x: place.x, y: place.y, viewportId: place.viewportId, viewId: place.viewId, point: place.point, elementGuid: place.elementGuid,
      author: topic.creationAuthor ?? '', createdAt: timeOf(topic.creationDate, readAt),
      status: closed(topic.topicStatus) ? 'done' : 'open', text: topic.description || topic.title,
      replies: topic.comments.map((c) => replyOf(c, opts.newId, readAt)), bcfGuid: topic.guid, ...(viewpointGuid ? { bcfViewpointGuid: viewpointGuid } : {}),
    });
  }
  return result;
}
