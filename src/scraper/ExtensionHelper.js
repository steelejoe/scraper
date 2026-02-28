/**
 * BSD 3-Clause License
 *
 * Copyright (c) 2025, Joe Steele in collaboration with Cursor AI (Claude Sonnet 4.5)
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * ExtensionHelper — WebSocket server for scraper-helper Chrome extension.
 * Enables Cloudflare-protected sites to be scraped via a real browser controlled by the extension.
 * See: ../scraper-helper/README.md
 */

import { WebSocketServer } from 'ws';

const DEFAULT_PORT = 8765;
const CONNECT_TIMEOUT_MS = 30000;
const LOAD_RESPONSE_TIMEOUT_MS = 120000;

export class ExtensionHelper {
  constructor(options = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.wss = null;
    this.client = null;
    this.connectPromise = null;
  }

  /**
   * Start the WebSocket server and wait for the extension to connect.
   * @returns {Promise<void>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });
      const timeout = setTimeout(() => {
        this.wss?.close();
        reject(new Error(
          `scraper-helper extension did not connect within ${CONNECT_TIMEOUT_MS / 1000}s. ` +
          'Ensure Chrome is open with the scraper-helper extension loaded and connected.'
        ));
      }, CONNECT_TIMEOUT_MS);

      this.wss.on('connection', (client) => {
        clearTimeout(timeout);
        this.client = client;
        console.log('[ExtensionHelper] scraper-helper extension connected');
        resolve();
      });

      this.wss.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`ExtensionHelper WebSocket server error: ${err.message}`));
      });

      console.log(`[ExtensionHelper] WebSocket server listening on ws://127.0.0.1:${this.port} (waiting for extension)`);
    });
  }

  /**
   * Load a URL in the extension's active tab and return the page HTML.
   * @param {string} url
   * @returns {Promise<string>} Full HTML of the loaded page
   */
  async loadUrl(url) {
    if (!this.client || this.client.readyState !== 1) {
      throw new Error('ExtensionHelper: no connected client. Call start() and ensure extension is connected.');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.client.removeListener('message', handler);
        reject(new Error(`loadUrl("${url}") timed out after ${LOAD_RESPONSE_TIMEOUT_MS / 1000}s`));
      }, LOAD_RESPONSE_TIMEOUT_MS);

      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.command === 'load') {
            clearTimeout(timeout);
            this.client.removeListener('message', handler);
            if (msg.success && msg.content != null) {
              resolve(msg.content);
            } else {
              reject(new Error(msg.error ?? 'load failed'));
            }
          }
        } catch (_) {
          // Ignore non-load responses (e.g. keepalive)
        }
      };

      this.client.on('message', handler);
      this.client.send(JSON.stringify({ command: 'load', params: { url } }));
    });
  }

  /**
   * Stop the WebSocket server.
   */
  async stop() {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    if (this.wss) {
      await new Promise((resolve) => {
        this.wss.close(() => resolve());
      });
      this.wss = null;
    }
  }
}
