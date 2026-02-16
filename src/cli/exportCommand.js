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
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { sanitizePathForFilename } from '../utils/pathUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.join(__dirname, '../../content');

function isNavLine(line) {
  const trimmed = line.trim();
  return trimmed.includes('Previous Chapter') && trimmed.includes('Next Chapter');
}

function stripChapterNav(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (isNavLine(lines[i])) continue;
    out.push(lines[i]);
  }
  // Remove trailing "---" and any trailing nav line(s)
  while (out.length > 0) {
    const last = out[out.length - 1].trim();
    if (last === '---' || last === '' || isNavLine(out[out.length - 1])) {
      out.pop();
    } else {
      break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function ensurePandoc() {
  try {
    execSync('pandoc --version', { stdio: 'ignore' });
  } catch {
    throw new Error('pandoc is not installed or not on PATH. Install pandoc to export EPUB/MOBI.');
  }
}

/**
 * Registers the export command with the given program.
 * @param {import('commander').Command} program - The Commander program instance
 * @param {import('../data/DataManager.js').DataManager} dataManager - The data manager instance
 */
export function registerExportCommand(program, dataManager) {
  program
    .command('export')
    .description('Export a scraped book to EPUB or MOBI for e-readers (e.g. Kindle). Strips chapter nav links. Requires pandoc.')
    .argument('<book-id>', 'The ID of the book to export')
    .argument('[format]', 'Output format: epub or mobi (default: epub). Can also use -f/--format.')
    .option('-o, --output <path>', 'Output file path (default: content/<book-id>/<book-id>.epub or .mobi)')
    .option('--author <author>', 'Author name for metadata')
    .option('-f, --format <format>', 'Output format: epub or mobi', 'epub')
    .option('--no-toc', 'Do not include a table of contents')
    .action(async (bookId, formatArg, options) => {
      try {
        const format = (formatArg || options.format || 'epub').toLowerCase();
        if (format !== 'epub' && format !== 'mobi') {
          throw new Error('--format must be epub or mobi');
        }
        ensurePandoc();
        const book = await dataManager.getBook(bookId);
        if (!book) throw new Error(`Book with id ${bookId} not found`);
        const sortedChapters = book.getChaptersSorted();
        if (sortedChapters.length === 0) throw new Error(`Book ${bookId} has no chapters`);

        const bookContentDir = path.join(CONTENT_DIR, bookId);
        if (!(await fs.pathExists(bookContentDir))) {
          throw new Error(`Content directory not found: ${bookContentDir}`);
        }

        const title = book.title || bookId.replace(/-/g, ' ');
        const combinedPath = path.join(bookContentDir, '_combined.md');
        const writeStream = fs.createWriteStream(combinedPath, { encoding: 'utf8' });

        const totalChapters = sortedChapters.length;
        const BAR_LENGTH = 20;

        function updateProgress(processedCount) {
          const pct = totalChapters === 0 ? 100 : Math.floor((processedCount / totalChapters) * 100);
          const filled = totalChapters === 0 ? BAR_LENGTH : Math.min(BAR_LENGTH, Math.floor((processedCount / totalChapters) * BAR_LENGTH));
          const bar = '█'.repeat(filled) + '░'.repeat(BAR_LENGTH - filled);
          const line = `\rExporting [${bar}] ${pct}%`;
          process.stdout.write(line.padEnd(40));
        }

        const streamDone = new Promise((resolve, reject) => {
          writeStream.once('finish', resolve);
          writeStream.once('error', reject);
        });

        try {
          updateProgress(0);
          let first = true;
          let processedCount = 0;
          for (const chapter of sortedChapters) {
            const chapterPath = book.getChapterPath(chapter);
            const sanitized = sanitizePathForFilename(chapterPath);
            const filePath = path.join(bookContentDir, `${sanitized}.md`);
            if (!(await fs.pathExists(filePath))) {
              console.warn(`Warning: skipping missing chapter file: ${sanitized}.md`);
              processedCount++;
              updateProgress(processedCount);
              continue;
            }
            const raw = await fs.readFile(filePath, 'utf8');
            const stripped = stripChapterNav(raw);
            if (!first) writeStream.write('\n\n');
            writeStream.write(stripped);
            first = false;
            processedCount++;
            updateProgress(processedCount);
          }
          writeStream.end();
          await streamDone;
          process.stdout.write('\n');
        } catch (err) {
          writeStream.destroy(err);
          await streamDone.catch(() => {});
          process.stdout.write('\n');
          throw err;
        }

        const outputPath = options.output || path.join(bookContentDir, `${bookId}.${format}`);
        const pandocArgs = [
          combinedPath,
          '-o', outputPath,
          '--metadata', `title=${JSON.stringify(title)}`,
          ...(options.toc !== false ? ['--toc'] : []),
        ];
        if (options.author) {
          pandocArgs.push('--metadata', `author=${JSON.stringify(options.author)}`);
        }

        const spinnerFrames = ['|', '/', '-', '\\'];
        let spinnerIndex = 0;
        const msg = `Converting to ${format.toUpperCase()} with pandoc`;
        const child = spawn('pandoc', pandocArgs, { stdio: 'ignore' });
        const spinner = setInterval(() => {
          process.stdout.write(`\r${spinnerFrames[spinnerIndex]} ${msg}`);
          spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        }, 80);

        const exitCode = await new Promise((resolve, reject) => {
          child.once('close', (code) => {
            clearInterval(spinner);
            process.stdout.write('\r' + ' '.repeat(msg.length + 3) + '\r');
            resolve(code);
          });
          child.once('error', (err) => {
            clearInterval(spinner);
            process.stdout.write('\r' + ' '.repeat(msg.length + 3) + '\r');
            reject(err);
          });
        });

        if (exitCode !== 0) {
          throw new Error(`pandoc exited with code ${exitCode}`);
        }

        console.log(`✓ Exported ${bookId} to ${outputPath}`);
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
}
