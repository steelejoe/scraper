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

import { ScraperEngine } from '../scraper/ScraperEngine.js';
import { getProxyFromOptions } from './proxyUtils.js';

/**
 * Registers the resume command with the given program.
 * @param {import('commander').Command} program - The Commander program instance
 * @param {import('../data/DataManager.js').DataManager} dataManager - The data manager instance
 */
export function registerResumeCommand(program, dataManager) {
  program
    .command('resume')
    .description('Resume scraping a book from the last scraped path')
    .argument('<book-id>', 'The ID of the book to resume scraping')
    .option('--force-save', 'Force save chapters even if they already exist (useful for fixing bad scrapes or updated content)')
    .option('--debug', 'Enable debug logging output')
    .option('--tor', 'Use Tor proxy for scraping (defaults to socks5://127.0.0.1:9050)')
    .option('--proxy <proxy>', 'Specify proxy address (e.g., socks5://127.0.0.1:9050 or 127.0.0.1:9050)')
    .action(async (bookId, options) => {
      try {
        const book = await dataManager.getBook(bookId);
        if (!book) {
          throw new Error(`Book with id ${bookId} not found`);
        }

        if (!book.lastPathScraped) {
          console.log('No previous scraping session found. Starting from root path.');
        } else {
          console.log(`Resuming from: ${book.lastPathScraped}`);
        }

        const engine = new ScraperEngine();
        const proxy = getProxyFromOptions(options);
        await engine.scrapeBook(bookId, options.forceSave || false, options.debug || false, proxy);
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
}
