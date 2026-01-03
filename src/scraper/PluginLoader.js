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
const PLUGINS_DIR = path.join(__dirname, '../plugins');

export class PluginLoader {
  constructor() {
    // Ensure plugins directory exists
    fs.ensureDirSync(PLUGINS_DIR);
  }

  async loadPlugin(domain) {
    const pluginPath = path.join(PLUGINS_DIR, `${domain}.js`);
    
    if (!(await fs.pathExists(pluginPath))) {
      throw new Error(`Plugin for domain ${domain} not found at ${pluginPath}`);
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
    if (!fs.existsSync(PLUGINS_DIR)) {
      return [];
    }
    
    return fs.readdirSync(PLUGINS_DIR)
      .filter(file => file.endsWith('.js'))
      .map(file => file.replace('.js', ''));
  }
}


