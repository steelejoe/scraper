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

/**
 * Registers the list-books command with the given program.
 * @param {import('commander').Command} program - The Commander program instance
 * @param {import('../data/DataManager.js').DataManager} dataManager - The data manager instance
 */
export function registerListBooksCommand(program, dataManager) {
  program
    .command('list-books')
    .description('List all books')
    .option('--scraped', 'Only show books with at least 1 chapter scraped')
    .action(async (_args, command) => {
      try {
        const options = command.opts();
        let books = await dataManager.loadBooks();
        if (options.scraped) {
          books = books.filter(book => book.chapters.length >= 1);
        }
        if (books.length === 0) {
          console.log('No books found.');
          return;
        }

        console.log('\nBooks:');
        console.log('─'.repeat(80));
        books.forEach(book => {
          console.log(`ID: ${book.id}`);
          if (book.title) {
            console.log(`Title: ${book.title}`);
          }
          console.log(`Root Site: ${book.rootSite}`);
          console.log(`Root Path: ${book.rootPath}`);
          console.log(`Plugin: ${book.plugin}`);
          console.log(`Last Scraped: ${book.lastPathScraped || 'Never'}`);
          console.log(`Chapters Scraped: ${book.chapters.length}`);
          console.log('─'.repeat(80));
        });
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
}
