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
import { Book } from '../models/Book.js';
import { PluginLoader } from '../scraper/PluginLoader.js';

/**
 * Registers the add-book command with the given program.
 * @param {import('commander').Command} program - The Commander program instance
 * @param {import('../data/DataManager.js').DataManager} dataManager - The data manager instance
 */
export function registerAddBookCommand(program, dataManager) {
  program
    .command('add-book')
    .description('Add a new book')
    .argument('<id>', 'Unique identifier for the book')
    .argument('<starting-url>', 'Full URL of the starting chapter (e.g., https://www.example.com/book-name/chapter-1)')
    .option('-r, --root-path <root-path>', 'Optional: Base path for the book (e.g., /book-name/). If not provided, will be extracted from the starting-url')
    .option('-t, --title <title>', 'Optional: Book title')
    .option('-c, --content-type <type>', "Optional: 'text' or 'image' (overrides plugin default when site has both)")
    .action(async (id, startingUrl, options) => {
      try {
        // Parse starting URL to extract domain and path
        let parsedUrl;
        try {
          parsedUrl = new URL(startingUrl);
        } catch (error) {
          throw new Error(`Invalid URL: ${startingUrl}. Please provide a complete URL including protocol (http:// or https://)`);
        }

        // Extract full domain (including subdomain)
        const rootSite = parsedUrl.hostname; // e.g., "www.example.com"
        const startingPath = parsedUrl.pathname + parsedUrl.search; // e.g., "/book-name/chapter-1" or "/book-name/chapter-1?page=1"

        // Extract rootPath from URL if not provided
        let finalRootPath;
        if (options.rootPath) {
          // Normalize root path (ensure it starts with /)
          const normalizedRootPath = options.rootPath.startsWith('/') ? options.rootPath : `/${options.rootPath}`;
          finalRootPath = normalizedRootPath.endsWith('/') ? normalizedRootPath : `${normalizedRootPath}/`;
        } else {
          // Generate rootPath from URL path (extract directory portion)
          // e.g., "/book-name/chapter-1" -> "/book-name/"
          let extractedRootPath = parsedUrl.pathname;
          if (extractedRootPath.includes('/')) {
            // Find the last slash and extract everything before it
            const lastSlashIndex = extractedRootPath.lastIndexOf('/');
            if (lastSlashIndex > 0) {
              extractedRootPath = extractedRootPath.substring(0, lastSlashIndex + 1);
            } else {
              extractedRootPath = '/';
            }
          } else {
            extractedRootPath = '/';
          }

          // Normalize root path (ensure it starts and ends with /)
          const normalizedRootPath = extractedRootPath.startsWith('/') ? extractedRootPath : `/${extractedRootPath}`;
          finalRootPath = normalizedRootPath.endsWith('/') ? normalizedRootPath : `${normalizedRootPath}/`;
        }

        // Plugin is the same as the domain (1:1 relationship)
        const plugin = rootSite;

        // Load plugin to determine contentType (book override takes precedence)
        const pluginLoader = new PluginLoader();
        let contentType = options.contentType ?? null;
        if (contentType && contentType !== 'text' && contentType !== 'image') {
          throw new Error(`Invalid contentType: ${contentType}. Must be 'text' or 'image'.`);
        }
        if (!contentType) {
          try {
            const pluginModule = await pluginLoader.loadPlugin(plugin);
            contentType = pluginModule.getContentType();
          } catch (error) {
            console.warn(`⚠ Warning: Could not load plugin for ${plugin}, contentType will be null: ${error.message}`);
          }
        }

        // Check if root site exists, create it if it doesn't
        let site = await dataManager.getRootSite(rootSite);
        if (!site) {
          // Automatically create site record with default description
          const description = `Site: ${rootSite}`;
          site = new RootSite(rootSite, description, null);
          await dataManager.addRootSite(site);
          console.log(`✓ Auto-created root site: ${rootSite}`);
        }

        const book = new Book(id, rootSite, finalRootPath, plugin, null, [], options.title || null, startingPath, contentType);
        await dataManager.addBook(book);
        console.log(`✓ Added book: ${id}`);
        if (book.title) {
          console.log(`  Title: ${book.title}`);
        }
        console.log(`  Root site: ${rootSite}`);
        console.log(`  Root path: ${finalRootPath}`);
        console.log(`  Starting path: ${startingPath}`);
        console.log(`  Plugin: ${plugin}`);
        if (book.contentType) {
          console.log(`  Content type: ${book.contentType}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
}
