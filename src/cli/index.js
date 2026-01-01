#!/usr/bin/env node

import { Command } from 'commander';
import { DataManager } from '../data/DataManager.js';
import { RootSite } from '../models/RootSite.js';
import { Book } from '../models/Book.js';
import { ScraperEngine } from '../scraper/ScraperEngine.js';

const program = new Command();
const dataManager = new DataManager();

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
  .action(async (bookId, options) => {
    try {
      const engine = new ScraperEngine();
      await engine.scrapeBook(bookId, options.forceSave || false);
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
      await engine.scrapeBookReverse(bookId, initialChapterNum, options.forceSave || false);
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
  .argument('<root-path>', 'Base path for the book (e.g., /book-name/) - used to validate URLs')
  .argument('<starting-url>', 'Full URL of the starting chapter (e.g., https://www.example.com/book-name/chapter-1)')
  .option('-t, --title <title>', 'Optional: Book title')
  .action(async (id, rootPath, startingUrl, options) => {
    try {
      // Normalize root path (ensure it starts with /)
      const normalizedRootPath = rootPath.startsWith('/') ? rootPath : `/${rootPath}`;

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
      
      // Plugin is the same as the domain (1:1 relationship)
      const plugin = rootSite;

      // Check if root site exists, create it if it doesn't
      let site = await dataManager.getRootSite(rootSite);
      if (!site) {
        // Automatically create site record with default description
        const description = `Site: ${rootSite}`;
        site = new RootSite(rootSite, description, null);
        await dataManager.addRootSite(site);
        console.log(`✓ Auto-created root site: ${rootSite}`);
      }

      const book = new Book(id, rootSite, normalizedRootPath, plugin, null, [], options.title || null, startingPath);
      await dataManager.addBook(book);
      console.log(`✓ Added book: ${id}`);
      if (book.title) {
        console.log(`  Title: ${book.title}`);
      }
      console.log(`  Root site: ${rootSite}`);
      console.log(`  Root path: ${normalizedRootPath}`);
      console.log(`  Starting path: ${startingPath}`);
      console.log(`  Plugin: ${plugin}`);
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

      console.log('\nRoot Sites:');
      console.log('─'.repeat(80));
      sites.forEach(site => {
        console.log(`Domain: ${site.domain}`);
        console.log(`Description: ${site.description}`);
        if (site.credentials) {
          console.log(`Credentials: ${site.credentials.username ? 'Yes' : 'No'}`);
        }
        console.log('─'.repeat(80));
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// List books command
program
  .command('list-books')
  .description('List all books')
  .action(async () => {
    try {
      const books = await dataManager.loadBooks();
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
      await engine.scrapeBook(bookId, options.forceSave || false);
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

// Parse arguments
program.parse();



