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
  .description('Scrape a specific book')
  .argument('<book-id>', 'The ID of the book to scrape')
  .action(async (bookId) => {
    try {
      const engine = new ScraperEngine();
      await engine.scrapeBook(bookId);
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
  .argument('<url>', 'URL of the first chapter (e.g., https://www.example.com/book/chapter-1)')
  .action(async (id, url) => {
    try {
      // Parse URL to extract domain and path
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (error) {
        throw new Error(`Invalid URL: ${url}. Please provide a complete URL including protocol (http:// or https://)`);
      }

      // Extract full domain (including subdomain) and path
      const rootSite = parsedUrl.hostname; // e.g., "www.example.com"
      const rootPath = parsedUrl.pathname + parsedUrl.search; // e.g., "/book/chapter-1" or "/book/chapter-1?page=1"
      
      // Plugin is the same as the domain (1:1 relationship)
      const plugin = rootSite;

      // Verify root site exists
      const site = await dataManager.getRootSite(rootSite);
      if (!site) {
        throw new Error(`Root site ${rootSite} not found. Add it first with 'add-site'`);
      }

      const book = new Book(id, rootSite, rootPath, plugin);
      await dataManager.addBook(book);
      console.log(`✓ Added book: ${id}`);
      console.log(`  Root site: ${rootSite}`);
      console.log(`  Root path: ${rootPath}`);
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
  .action(async (bookId) => {
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
      await engine.scrapeBook(bookId);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();



