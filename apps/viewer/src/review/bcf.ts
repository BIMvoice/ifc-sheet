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
  type BCFPoint, type BCFProject, type BCFTopic, type BCFViewpoint,
} from '@ifc-lite/bcf';
import { drawingToWorld } from '@/drafting/frame';
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

function viewpointOf(c: ReviewComment, opts: BcfExportOptions): BCFViewpoint {
  const viewpoint: BCFViewpoint = {
    guid: generateUuid(),
    components: { selection: [{ ifcGuid: c.elementGuid, originatingSystem: ORIGIN }] },
  };
  const plane = c.viewId && c.point ? opts.drawingOf(c.viewId)?.config.plane : undefined;
  if (!plane || !c.point) return viewpoint;
  // Look at the pin's point, square on to the view's plane, from the side the view is seen from.
  const target = drawingToWorld(plane, c.point);
  const normal = { x: 0, y: 0, z: 0 };
  normal[plane.axis] = plane.flipped ? -1 : 1;
  const up = plane.axis === 'y' ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
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
  topic.creationDate = new Date(c.createdAt).toISOString();
  topic.viewpoints.push(viewpointOf(c, opts));
  topic.comments = c.replies.map((r) => ({ ...createBCFComment({ author: r.author, comment: r.text }), date: new Date(r.createdAt).toISOString() }));
  return topic;
}

/** The BCF project of the comments that lie on a model element. */
export function commentsToBcf(comments: readonly ReviewComment[], opts: BcfExportOptions): BCFProject {
  const project = createBCFProject({ name: opts.projectName });
  for (const c of exportableComments(comments)) {
    const topic = topicOf(c, opts);
    project.topics.set(topic.guid, topic);
  }
  return project;
}

export interface BcfImportResult {
  comments: ReviewComment[];
  /** Topics that none of the sheets' drawings shows an element of. */
  unplaced: number;
  /** Topics that are this project's own comments, already here. */
  known: number;
}

const closed = (status: string | undefined): boolean => /^(closed|resolved|done)$/i.test(status ?? '');

function guidsOf(topic: BCFTopic): string[] {
  return topic.viewpoints.flatMap((v) => (v.components?.selection ?? []).flatMap((c) => (c.ifcGuid ? [c.ifcGuid] : [])));
}

/** The comments a BCF project's topics make on the sheets (ids are the caller's to give). */
export function bcfToComments(
  project: BCFProject,
  existing: readonly ReviewComment[],
  opts: { sheets: readonly ProjectSheet[]; drawingOf: DrawingOf; guidOf: GuidOf; newId: () => string },
): BcfImportResult {
  const result: BcfImportResult = { comments: [], unplaced: 0, known: 0 };
  const have = new Set(existing.map((c) => c.id));
  for (const topic of project.topics.values()) {
    const own = topic.labels?.find((l) => l.startsWith(COMMENT_LABEL))?.slice(COMMENT_LABEL.length);
    if (own && have.has(own)) {
      result.known++;
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
    const replies: CommentReply[] = topic.comments.map((c) => ({ id: opts.newId(), author: c.author ?? '', createdAt: c.date ? Date.parse(c.date) || 0 : 0, text: c.comment }));
    result.comments.push({
      id: own ?? opts.newId(), sheetId: sheet.id, x: place.x, y: place.y, viewportId: place.viewportId, viewId: place.viewId, point: place.point, elementGuid: place.elementGuid,
      author: topic.creationAuthor ?? '', createdAt: topic.creationDate ? Date.parse(topic.creationDate) || 0 : 0,
      status: closed(topic.topicStatus) ? 'done' : 'open', text: topic.description || topic.title, replies,
    });
  }
  return result;
}
