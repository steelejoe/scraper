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

import { PluginLoader } from '../scraper/PluginLoader.js';

/**
 * Registers the list-sites command with the given program.
 * @param {import('commander').Command} program - The Commander program instance
 * @param {import('../data/DataManager.js').DataManager} dataManager - The data manager instance
 */
export function registerListSitesCommand(program, dataManager) {
  program
    .command('list-sites')
    .description('List all root sites')
    .action(async () => {
      try {
        const sites = await dataManager.loadRootSites();
        if (sites.length === 0) {
          console.log('No root sites found.');
          return;
        }

        const pluginLoader = new PluginLoader();
        const availablePlugins = new Set(pluginLoader.listAvailablePlugins());

        const sitesWithPlugin = sites.filter(site => availablePlugins.has(site.domain));
        const sitesWithoutPlugin = sites.filter(site => !availablePlugins.has(site.domain));

        const INDENT = '  ';
        const defaultDesc = (site) => site.description === `Site: ${site.domain}`;
        const printSite = (site) => {
          const line = defaultDesc(site) ? site.domain : `${site.domain}: ${site.description}`;
          console.log(`${INDENT}${line}`);
        };

        if (sitesWithPlugin.length > 0) {
          console.log('\nSites with plugins (have a scraper implementation):');
          sitesWithPlugin.forEach(printSite);
        }

        if (sitesWithoutPlugin.length > 0) {
          console.log('\nSites without plugins (no scraper implementation found):');
          sitesWithoutPlugin.forEach(printSite);
        }
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
}
