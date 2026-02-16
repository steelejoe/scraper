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

import { RootSite } from '../models/RootSite.js';

/**
 * Registers the add-site command with the given program.
 * @param {import('commander').Command} program - The Commander program instance
 * @param {import('../data/DataManager.js').DataManager} dataManager - The data manager instance
 */
export function registerAddSiteCommand(program, dataManager) {
  program
    .command('add-site')
    .description('Add a new root site')
    .argument('<domain>', 'The root domain (e.g., example.com)')
    .argument('<description>', 'Description of the site')
    .option('-u, --username <username>', 'Username for authentication')
    .option('-p, --password <password>', 'Password for authentication')
    .action(async (domain, description, options) => {
      try {
        const credentials = (options.username || options.password) ? {
          username: options.username || '',
          password: options.password || ''
        } : null;

        const site = new RootSite(domain, description, credentials);
        await dataManager.addRootSite(site);
        console.log(`✓ Added root site: ${domain}`);
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
}
