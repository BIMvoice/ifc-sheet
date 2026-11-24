/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A local HTTP server for tests that stands in for a remote file host: it
 * serves the files of one directory under `/<prefix>/`, and 404 for anything
 * else. Used by fetch-prebuilt-wasm.branch.test.mjs in place of
 * raw.githubusercontent.com, so no test touches the network.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, join } from 'node:path';

/** Resolves `{ url, close }`; `url` has no trailing slash. */
export function serveDir(dir, prefix = 'files') {
  const server = createServer((req, res) => {
    const name = req.url.startsWith(`/${prefix}/`) ? basename(req.url) : '';
    const file = join(dir, name);
    if (!name || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end('404: Not Found');
      return;
    }
    res.end(readFileSync(file));
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      resolveServer({
        url: `http://127.0.0.1:${server.address().port}/${prefix}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
