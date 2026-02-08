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
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
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

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGINS_ROOT = path.join(__dirname, '../plugins');

/**
 * Recursively find all .js plugin files under PLUGINS_ROOT.
 * Skips directories whose name begins with '.' (hidden folders).
 * @returns {Array<{domain: string, path: string}>} Array of { domain, path }
 */
function findPluginPaths(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(root, entry.name);

    if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push({ domain: entry.name.replace('.js', ''), path: fullPath });
    } else if (entry.isDirectory()) {
      results.push(...findPluginPaths(fullPath));
    }
  }
  return results;
}

export class PluginLoader {
  constructor() {
    fs.ensureDirSync(PLUGINS_ROOT);
  }

  async loadPlugin(domain) {
    const pluginMap = new Map(findPluginPaths(PLUGINS_ROOT).map(p => [p.domain, p.path]));
    const pluginPath = pluginMap.get(domain);

    if (!pluginPath) {
      throw new Error(`Plugin for domain ${domain} not found`);
    }

    try {
      const plugin = await import(`file://${pluginPath}`);
      this.validatePlugin(plugin);
      return plugin;
    } catch (error) {
      throw new Error(`Failed to load plugin for ${domain}: ${error.message}`);
    }
  }

  validatePlugin(plugin) {
    const requiredMethods = [
      'getNextChapterUrl',
      'getPreviousChapterUrl',
      'hasContent',
      'scrapeChapter',
      'getContentType'
    ];

    for (const method of requiredMethods) {
      if (typeof plugin[method] !== 'function') {
        throw new Error(`Plugin is missing required method: ${method}`);
      }
    }

    // Validate getContentType returns a valid value
    const contentType = plugin.getContentType();
    if (contentType !== 'text' && contentType !== 'image') {
      throw new Error(`Plugin getContentType() must return 'text' or 'image', got: ${contentType}`);
    }

    return true;
  }

  listAvailablePlugins() {
    const plugins = findPluginPaths(PLUGINS_ROOT);
    return [...new Set(plugins.map(p => p.domain))];
  }
}


