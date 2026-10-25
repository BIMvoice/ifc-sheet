/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the issues of a project file. Strict, unlike the catalogues: an
 * issue is a record of what was sent, so a damaged one is refused with the
 * place of the problem rather than silently repaired.
 */

import { paperFromLabel } from '@/project/paper';
import type { ChangeReason, ChangedSheet, IssueChangeRecord, IssuedModel, IssuedSheet, ProjectIssue } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

function text(o: Json, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string') fail(`${path}/${key}`, 'must be text');
  return v;
}

function readSheet(v: unknown, path: string): IssuedSheet {
  if (!isObject(v)) fail(path, 'must be an issued sheet');
  const paper = v.paper;
  if (!paperFromLabel(paper)) fail(`${path}/paper`, 'must be a paper: A0 to A4, an elongated size like A3×3, or a custom size like 500×700');
  if (v.orientation !== 'landscape' && v.orientation !== 'portrait') fail(`${path}/orientation`, 'must be landscape or portrait');
  const fingerprint = text(v, 'fingerprint', path);
  if (!/^[0-9a-f]{14}$/.test(fingerprint)) fail(`${path}/fingerprint`, 'must be 14 hex digits');
  if (v.sheetId !== undefined && typeof v.sheetId !== 'string') fail(`${path}/sheetId`, 'must be text');
  return { ...(typeof v.sheetId === 'string' ? { sheetId: v.sheetId } : {}), number: text(v, 'number', path), title: text(v, 'title', path), scale: text(v, 'scale', path), paper: paper as string, orientation: v.orientation, revision: text(v, 'revision', path), fingerprint };
}

function readSheetList(v: unknown, path: string): ChangedSheet[] {
  if (!Array.isArray(v)) fail(path, 'must be an array');
  return v.map((s, i) => {
    if (!isObject(s)) fail(`${path}/${i}`, 'must be a sheet');
    const reasons = s.reasons;
    if (reasons !== undefined && (!Array.isArray(reasons) || !reasons.every((r) => r === 'edited' || r === 'model'))) fail(`${path}/${i}/reasons`, 'must list edited and/or model');
    return { number: text(s, 'number', `${path}/${i}`), title: text(s, 'title', `${path}/${i}`), ...(reasons ? { reasons: reasons as ChangeReason[] } : {}) };
  });
}

function readModel(v: unknown, path: string): IssuedModel {
  if (!isObject(v)) fail(path, 'must be the model as issued');
  const hash = text(v, 'hash', path);
  if (!/^[0-9a-f]{14}$/.test(hash)) fail(`${path}/hash`, 'must be 14 hex digits');
  if (!Number.isInteger(v.count) || (v.count as number) < 0) fail(`${path}/count`, 'must be a whole number');
  if (typeof v.takenAt !== 'number' || !Number.isFinite(v.takenAt)) fail(`${path}/takenAt`, 'must be a number');
  return { hash, count: v.count as number, takenAt: v.takenAt };
}

function readChanges(v: unknown, path: string): IssueChangeRecord {
  if (!isObject(v) || !isObject(v.against)) fail(path, 'must be the changes since the issue before');
  return {
    against: { id: text(v.against, 'id', `${path}/against`), name: text(v.against, 'name', `${path}/against`) },
    added: readSheetList(v.added, `${path}/added`), removed: readSheetList(v.removed, `${path}/removed`), changed: readSheetList(v.changed, `${path}/changed`),
  };
}

export function readIssues(raw: unknown): ProjectIssue[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail('/issues', 'must be an array');
  const ids = new Set<string>();
  return raw.map((v, i) => {
    const path = `/issues/${i}`;
    if (!isObject(v)) fail(path, 'must be an issue');
    const id = text(v, 'id', path);
    if (ids.has(id)) fail(`${path}/id`, `"${id}" is used by two issues`);
    ids.add(id);
    const date = text(v, 'date', path);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`${path}/date`, 'must be YYYY-MM-DD');
    if (typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt)) fail(`${path}/createdAt`, 'must be a number');
    if (!Array.isArray(v.sheets)) fail(`${path}/sheets`, 'must be an array');
    return { id, name: text(v, 'name', path), date, createdAt: v.createdAt, sheets: v.sheets.map((s, j) => readSheet(s, `${path}/sheets/${j}`)), ...(v.changes !== undefined ? { changes: readChanges(v.changes, `${path}/changes`) } : {}), ...(v.model !== undefined ? { model: readModel(v.model, `${path}/model`) } : {}) };
  });
}
