/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Feedback form may attach (#148), gathered only from the build,
 * the browser and where the user is. Deliberately NOT read from here: file
 * and model names, entity names, GlobalIds, property values, sheet or view
 * names. Each fact is an id, an enum or a number.
 */

import { useDraftingSession } from '@/drafting/session';
import { useProjectStore } from '@/project/project-store';
import { useWallNav } from '@/components/viewer/wall/wall-nav';
import type { FeedbackFacts } from './feedback-url';

const MAJOR = (ua: string, token: RegExp): string => ua.match(token)?.[1] ?? '';

/** The browser and its major version, and the OS family: nothing finer than the User-Agent already says to every site. */
export function browserSummary(ua: string): { browser: string; os: string } {
  const named = (name: string, token: RegExp): string => `${name} ${MAJOR(ua, token)}`.trim();
  // Order matters: Edge and Opera also say Chrome; Chrome also says Safari.
  const browser = /Edg\//.test(ua) ? named('Edge', /Edg\/(\d+)/)
    : /OPR\//.test(ua) ? named('Opera', /OPR\/(\d+)/)
    : /Firefox\//.test(ua) ? named('Firefox', /Firefox\/(\d+)/)
    : /Chrome\//.test(ua) ? named('Chrome', /Chrome\/(\d+)/)
    : /Safari\//.test(ua) ? named('Safari', /Version\/(\d+)/)
    : 'unknown';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux|X11/.test(ua) ? 'Linux'
    : 'unknown';
  return { browser, os };
}

export function collectFeedbackFacts(): FeedbackFacts {
  const version = typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'unknown';
  const sha = typeof __BUILD_SHA__ === 'string' && __BUILD_SHA__ ? __BUILD_SHA__ : 'unknown';
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const { browser, os } = browserSummary(nav?.userAgent ?? '');
  const environment = [
    `IfcSheet ${version} (${sha})`,
    `Browser: ${browser}`,
    `OS: ${os}`,
    `WebGPU: ${nav && 'gpu' in nav ? 'available' : 'unavailable'}`,
  ];

  const { stepped, focus } = useWallNav.getState();
  const project = useProjectStore.getState();
  const sheet = stepped ? project.sheets.find((s) => s.id === stepped) : undefined;
  const view = focus ? project.views.find((v) => v.id === focus) : undefined;
  const tool = useDraftingSession.getState().commandId;
  const place = [
    sheet ? `Sheet: ${sheet.number}` : 'Screen: the Wall',
    ...(view ? [`View kind: ${view.kind}`] : []),
    ...(tool ? [`Running tool: ${tool}`] : []),
  ];
  return { environment, place };
}
