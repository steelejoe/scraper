#!/usr/bin/env node

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

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn, spawnSync } from 'child_process';
import { DataManager } from '../data/DataManager.js';
import { RootSite } from '../models/RootSite.js';
import { Book } from '../models/Book.js';
import { ScraperEngine } from '../scraper/ScraperEngine.js';
import { PluginLoader } from '../scraper/PluginLoader.js';
import { sanitizePathForFilename } from '../utils/pathUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.join(__dirname, '../../content');

const program = new Command();
const dataManager = new DataManager();

// Helper function to determine proxy string from options
function getProxyFromOptions(options) {
  if (options.tor && !options.proxy) {
    return 'socks5://127.0.0.1:9050'; // return default Tor proxy
  }
  
  return options.proxy;
}

program
  .name('scraper')
  .description('Plugin-based web scraper for chapter-based content')
  .version('1.0.0');

// Scrape command
program
  .command('scrape')
  .description('Scrape a specific book (forward)')
  .argument('<book-id>', 'The ID of the book to scrape')
  .option('--force-save', 'Force save chapters even if they already exist (useful for fixing bad scrapes or updated content)')
  .option('--debug', 'Enable debug logging output')
  .option('--tor', 'Use Tor proxy for scraping (defaults to socks5://127.0.0.1:9050)')
  .option('--proxy <proxy>', 'Specify proxy address (e.g., socks5://127.0.0.1:9050 or 127.0.0.1:9050)')
  .action(async (bookId, options) => {
    try {
      const engine = new ScraperEngine();
      const proxy = getProxyFromOptions(options);
      await engine.scrapeBook(bookId, options.forceSave || false, options.debug || false, proxy);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Reverse scrape command
program
  .command('scrape-reverse')
  .description('Scrape a book in reverse (from initial chapter backwards). If chapter number is not provided, it will be extracted from the initial page.')
  .argument('<book-id>', 'The ID of the book to scrape')
  .argument('[chapter-number]', 'Optional: The chapter number of the initial chapter. If not provided, will be extracted from the initial page.')
  .option('--force-save', 'Force save chapters even if they already exist (useful for fixing bad scrapes or updated content)')
  .option('--debug', 'Enable debug logging output')
  .option('--tor', 'Use Tor proxy for scraping (defaults to socks5://127.0.0.1:9050)')
  .option('--proxy <proxy>', 'Specify proxy address (e.g., socks5://127.0.0.1:9050 or 127.0.0.1:9050)')
  .action(async (bookId, chapterNumber, options) => {
    try {
      let initialChapterNum = null;
      if (chapterNumber) {
        initialChapterNum = parseFloat(chapterNumber);
        if (isNaN(initialChapterNum) || initialChapterNum <= 0) {
          throw new Error('Chapter number must be a positive number');
        }
      }
      const engine = new ScraperEngine();
      const proxy = getProxyFromOptions(options);
      await engine.scrapeBookReverse(bookId, initialChapterNum, options.forceSave || false, options.debug || false, proxy);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Add site command
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

// Add book command
program
  .command('add-book')
  .description('Add a new book')
  .argument('<id>', 'Unique identifier for the book')
  .argument('<starting-url>', 'Full URL of the starting chapter (e.g., https://www.example.com/book-name/chapter-1)')
  .option('-r, --root-path <root-path>', 'Optional: Base path for the book (e.g., /book-name/). If not provided, will be extracted from the starting-url')
  .option('-t, --title <title>', 'Optional: Book title')
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

      // Load plugin to determine contentType
      const pluginLoader = new PluginLoader();
      let contentType = null;
      try {
        const pluginModule = await pluginLoader.loadPlugin(plugin);
        contentType = pluginModule.getContentType();
      } catch (error) {
        console.warn(`⚠ Warning: Could not load plugin for ${plugin}, contentType will be null: ${error.message}`);
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

// List sites command
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

// List books command
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

// Resume command
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

// Generate TOC command
program
  .command('generate-toc')
  .description('Generate or update TOC.md file for a book based on currently scraped chapters')
  .argument('<book-id>', 'The ID of the book to generate TOC for')
  .action(async (bookId) => {
    try {
      const engine = new ScraperEngine();
      await engine.generateTOC(bookId);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Export to EPUB or MOBI (strip nav links, then run pandoc)
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

// Ingest URLs command
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

// Parse arguments
program.parse();



