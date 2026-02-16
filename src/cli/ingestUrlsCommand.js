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

import fs from 'fs-extra';
import { RootSite } from '../models/RootSite.js';
import { Book } from '../models/Book.js';
import { PluginLoader } from '../scraper/PluginLoader.js';

/**
 * Registers the ingest-urls command with the given program.
 * @param {import('commander').Command} program - The Commander program instance
 * @param {import('../data/DataManager.js').DataManager} dataManager - The data manager instance
 */
export function registerIngestUrlsCommand(program, dataManager) {
  program
    .command('ingest-urls')
    .description('Ingest a file containing URLs (one per line) and create site and book records for each')
    .argument('<file-path>', 'Path to the file containing URLs (one per line, separated by carriage returns)')
    .action(async (filePath) => {
      try {
        // Check if file exists
        if (!(await fs.pathExists(filePath))) {
          throw new Error(`File not found: ${filePath}`);
        }

        // Read file and split by newlines (handle both \n and \r\n)
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const urls = fileContent
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#')); // Filter empty lines and comments

        if (urls.length === 0) {
          console.log('No URLs found in file.');
          return;
        }

        console.log(`Processing ${urls.length} URL(s)...\n`);

        const pluginLoader = new PluginLoader();
        let sitesCreated = 0;
        let sitesSkipped = 0;
        let booksCreated = 0;
        let booksSkipped = 0;

        for (const urlString of urls) {
          try {
            // Parse URL
            let parsedUrl;
            try {
              parsedUrl = new URL(urlString);
            } catch (error) {
              console.warn(`⚠ Skipping invalid URL: ${urlString} (${error.message})`);
              continue;
            }

            const rootSite = parsedUrl.hostname;
            const startingPath = parsedUrl.pathname + parsedUrl.search;

            // Generate rootPath from URL path (extract directory portion)
            // e.g., "/book-name/chapter-1" -> "/book-name/"
            let rootPath = parsedUrl.pathname;
            if (rootPath.includes('/')) {
              // Find the last slash and extract everything before it
              const lastSlashIndex = rootPath.lastIndexOf('/');
              if (lastSlashIndex > 0) {
                rootPath = rootPath.substring(0, lastSlashIndex + 1);
              } else {
                rootPath = '/';
              }
            } else {
              rootPath = '/';
            }

            // Normalize root path (ensure it starts and ends with /)
            const normalizedRootPath = rootPath.startsWith('/') ? rootPath : `/${rootPath}`;
            const finalRootPath = normalizedRootPath.endsWith('/') ? normalizedRootPath : `${normalizedRootPath}/`;

            // Generate book ID from rootPath (sanitize for use as ID)
            // Remove leading/trailing slashes, replace remaining slashes with hyphens
            let bookId = finalRootPath.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
            if (!bookId) {
              // Fallback: use domain + hash of path
              bookId = `${rootSite.replace(/\./g, '-')}-${Math.abs(startingPath.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)).toString(36).substring(0, 8)}`;
            }

            // Plugin is the same as the domain (1:1 relationship)
            const plugin = rootSite;

            // Load plugin to determine contentType
            let contentType = null;
            try {
              const pluginModule = await pluginLoader.loadPlugin(plugin);
              contentType = pluginModule.getContentType();
            } catch (error) {
              // Plugin not found is okay, contentType will be null
            }

            // Check if root site exists
            const siteExists = await dataManager.hasRootSite(rootSite);
            if (siteExists) {
              console.log(`⏭ Site already exists, skipping: ${rootSite}`);
              sitesSkipped++;
            } else {
              // Create site
              const description = `Site: ${rootSite}`;
              const site = new RootSite(rootSite, description, null);
              await dataManager.addRootSite(site);
              console.log(`✓ Created site: ${rootSite}`);
              sitesCreated++;
            }

            // Check if book with this rootPath already exists
            const existingBook = await dataManager.getBookByRootPath(rootSite, finalRootPath);
            if (existingBook) {
              console.log(`⏭ Book already exists with root path, skipping: ${urlString} (book ID: ${existingBook.id}, root path: ${finalRootPath})`);
              booksSkipped++;
            } else {
              // Check if book ID already exists (might have different startingPath)
              const bookWithId = await dataManager.getBook(bookId);
              if (bookWithId) {
                // Book ID collision - append a suffix
                let counter = 1;
                let uniqueBookId = `${bookId}-${counter}`;
                while (await dataManager.getBook(uniqueBookId)) {
                  counter++;
                  uniqueBookId = `${bookId}-${counter}`;
                }
                bookId = uniqueBookId;
              }

              // Create book
              const book = new Book(bookId, rootSite, finalRootPath, plugin, null, [], null, startingPath, contentType);
              await dataManager.addBook(book);
              console.log(`✓ Created book: ${bookId} (${urlString})`);
              booksCreated++;
            }
          } catch (error) {
            console.error(`✗ Error processing URL ${urlString}: ${error.message}`);
            // Continue with next URL
          }
        }

        // Summary
        console.log(`\n=== Summary ===`);
        console.log(`Sites created: ${sitesCreated}`);
        console.log(`Sites skipped: ${sitesSkipped}`);
        console.log(`Books created: ${booksCreated}`);
        console.log(`Books skipped: ${booksSkipped}`);
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
}
