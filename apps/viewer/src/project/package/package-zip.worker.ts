/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Zips a project package off the main thread (#154); see `package-zip.ts`. */

import { answerZipRequest, type ZipReply, type ZipRequest } from './package-zip';

const scope = self as unknown as {
  onmessage: ((event: { data: ZipRequest }) => void) | null;
  postMessage(message: ZipReply, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  const reply = answerZipRequest(data);
  scope.postMessage(reply, 'bytes' in reply ? [reply.bytes.buffer as ArrayBuffer] : []);
};
