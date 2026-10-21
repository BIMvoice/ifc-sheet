/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Writing and reading a project package (`format.ts`): the document split
 * into parts, the native models' IFC, a manifest with every part's hash. On
 * read every hash is checked and the document is validated by the project
 * file reader, so a damaged or hand-edited package fails with a reason
 * instead of opening half. Pure: the same bytes in a ZIP, in the browser's
 * storage or in an object store.
 */

import { strFromU8, strToU8, unzipSync } from 'fflate';
import type { ProjectDocument } from '../types';
import { parseProjectFile, PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, type ProjectFileSchema } from '../project-file';
import {
  MANIFEST_PATH, PACKAGE_FORMAT, PACKAGE_VERSION, segment, sha256,
  type ModelRole, type PackageManifest, type PackageModel, type PackageVersionInfo,
} from './format';
import { mergeParts, splitDocument } from './split';
import type { PackageFiles } from './package-zip';

export { zipPackage, zipPackageOffThread, type PackageFiles } from './package-zip';

export interface ModelInput {
  id: string;
  name: string;
  role: ModelRole;
  /** A native model's complete IFC. */
  bytes?: Uint8Array;
  /** A linked model: where it is found, and its hash when known. */
  source?: string;
  sha256?: string;
}

export interface PackageInput {
  projectId: string;
  doc: ProjectDocument;
  models: readonly ModelInput[];
  app?: { name: string; version: string };
  author?: string;
  versionInfo?: PackageVersionInfo;
  now?: Date;
  /** Further parts by path (analytics tables), listed in the manifest like the rest. */
  extras?: ReadonlyMap<string, Uint8Array>;
}

const json = (value: unknown) => strToU8(JSON.stringify(value));

export async function buildPackage(input: PackageInput): Promise<{ files: PackageFiles; manifest: PackageManifest }> {
  const files: PackageFiles = new Map();
  for (const [path, value] of splitDocument(input.doc)) files.set(path, json(value));
  const models: PackageModel[] = [];
  const usedPaths = new Set<string>();
  for (const m of input.models) {
    if (m.role === 'native') {
      if (!m.bytes) throw new Error(`Native model "${m.name}" has no IFC to save`);
      let path = `models/${segment(m.id)}.ifc`;
      for (let i = 2; usedPaths.has(path); i++) path = `models/${segment(m.id)}-${i}.ifc`;
      usedPaths.add(path);
      files.set(path, m.bytes);
      models.push({ id: m.id, name: m.name, role: 'native', path, sha256: await sha256(m.bytes), size: m.bytes.byteLength });
    } else {
      models.push({ id: m.id, name: m.name, role: 'linked', ...(m.source ? { source: m.source } : {}), ...(m.sha256 ? { sha256: m.sha256 } : {}) });
    }
  }
  for (const [path, bytes] of input.extras ?? []) files.set(path, bytes);
  const parts = await Promise.all([...files].map(async ([path, bytes]) => ({ path, sha256: await sha256(bytes), size: bytes.byteLength })));
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT, version: PACKAGE_VERSION,
    app: input.app ?? { name: 'BIMVoice', version: '0' },
    projectId: input.projectId, projectName: input.doc.name,
    savedAt: (input.now ?? new Date()).toISOString(),
    ...(input.author ? { author: input.author } : {}),
    models, parts: parts.sort((a, b) => a.path.localeCompare(b.path)),
    ...(input.versionInfo ? { versionInfo: input.versionInfo } : {}),
    projectFileVersion: PROJECT_FILE_VERSION,
  };
  files.set(MANIFEST_PATH, strToU8(JSON.stringify(manifest, null, 2)));
  return { files, manifest };
}

export function unzipPackage(bytes: Uint8Array): PackageFiles {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error('Not a project package: the file is not a ZIP archive');
  }
  return new Map(Object.entries(entries).filter(([path]) => !path.endsWith('/')));
}

export interface OpenedPackage {
  manifest: PackageManifest;
  doc: ProjectDocument;
  /** Native models with their IFC; linked ones as references. */
  models: { model: PackageModel; bytes?: Uint8Array }[];
}

function readManifest(files: PackageFiles): PackageManifest {
  const raw = files.get(MANIFEST_PATH);
  if (!raw) throw new Error('Not a project package: manifest.json is missing');
  let m: PackageManifest;
  try {
    m = JSON.parse(strFromU8(raw)) as PackageManifest;
  } catch {
    throw new Error('Not a project package: manifest.json is not JSON');
  }
  if (m?.format !== PACKAGE_FORMAT) throw new Error('Not a project package: unknown format');
  if (typeof m.version !== 'number' || m.version > PACKAGE_VERSION) {
    throw new Error(`This project was saved by a newer version of the app (package format ${m.version}); update the app to open it`);
  }
  if (!Array.isArray(m.parts) || !Array.isArray(m.models) || typeof m.projectId !== 'string') throw new Error('Not a project package: the manifest is incomplete');
  const v = m.projectFileVersion;
  if (v !== undefined && !(typeof v === 'number' && Number.isInteger(v) && v >= 1)) throw new Error('Not a project package: projectFileVersion must be a whole number from 1');
  return m;
}

/**
 * Read and check a package: every listed part present with its hash, the document valid. The parts
 * are read as the project file version the manifest records (1 when it records none), so an older
 * package is migrated and a newer one refused, exactly as a project file is.
 */
export async function readPackage(files: PackageFiles, schema?: ProjectFileSchema): Promise<OpenedPackage> {
  const manifest = readManifest(files);
  for (const part of manifest.parts) {
    const bytes = files.get(part.path);
    if (!bytes) throw new Error(`The project package is damaged: ${part.path} is missing`);
    if (bytes.byteLength !== part.size || (await sha256(bytes)) !== part.sha256) throw new Error(`The project package is damaged: ${part.path} does not match its checksum`);
  }
  const parts = new Map<string, unknown>();
  for (const part of manifest.parts) {
    if (!part.path.startsWith('project/')) continue;
    try {
      parts.set(part.path, JSON.parse(strFromU8(files.get(part.path)!)));
    } catch {
      throw new Error(`The project package is damaged: ${part.path} is not JSON`);
    }
  }
  // The project file reader validates (and migrates) the merged document.
  const doc = parseProjectFile(JSON.stringify({ ...mergeParts(parts), format: PROJECT_FILE_FORMAT, version: manifest.projectFileVersion ?? 1, savedAt: manifest.savedAt }), schema);
  const models = manifest.models.map((model) => ({ model, bytes: model.role === 'native' && model.path ? files.get(model.path) : undefined }));
  for (const { model, bytes } of models) {
    if (model.role === 'native' && !bytes) throw new Error(`The project package is damaged: model "${model.name}" is missing`);
  }
  return { manifest, doc, models };
}
