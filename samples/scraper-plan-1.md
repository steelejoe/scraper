# Book record content type enum
_Exported on 1/3/2026 at 10:38:45 PST from Cursor (2.3.15)_

---

**User**

Add a new member to the book record to indicate whether book contains text or images as an enum.

---

**Cursor**

Reviewing the book record structure to add a text/image enum field.


Reading the Book model file to understand the structure:


Checking where books are created and how plugins are used:


Checking PluginLoader to see how plugins are loaded:


Updating the Book model to add the `contentType` enum field:


```javascript
export class Book {
  constructor(id, rootSite, rootPath, plugin, lastPathScraped = null, chapters = [], title = null, startingPath = null, contentType = null) {
    this.id = id;
    this.rootSite = rootSite;
    this.rootPath = rootPath;
    this.plugin = plugin;
    this.lastPathScraped = lastPathScraped;
    this.title = title;
    this.startingPath = startingPath || rootPath; // Default to rootPath for backward compatibility
    // Chapters can be array of strings (legacy) or array of {path, number} objects
    this.chapters = Array.isArray(chapters) ? chapters : [];
    this.contentType = contentType; // 'text' or 'image' or null
  }

  static fromJSON(json) {
    // Convert chapters from JSON (handle both legacy string format and new object format)
    const chapters = (json.chapters || []).map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return new Book(
      json.id,
      json.rootSite,
      json.rootPath,
      json.plugin,
      json.lastPathScraped || null,
      chapters,
      json.title || null,
      json.startingPath || null
    );
  }

  toJSON() {
    // Convert chapters to JSON format (preserve structure)
    const chaptersJSON = this.chapters.map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return {
      id: this.id,
      rootSite: this.rootSite,
      rootPath: this.rootPath,
      plugin: this.plugin,
      lastPathScraped: this.lastPathScraped,
      chapters: chaptersJSON,
      ...(this.title && { title: this.title }),
      ...(this.startingPath && { startingPath: this.startingPath })
    };
  }

  validate() {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Book must have a valid id');
    }
    if (!this.rootSite || typeof this.rootSite !== 'string') {
      throw new Error('Book must have a valid rootSite');
    }
    if (!this.rootPath || typeof this.rootPath !== 'string') {
      throw new Error('Book must have a valid rootPath');
    }
    if (!this.plugin || typeof this.plugin !== 'string') {
      throw new Error('Book must have a valid plugin');
    }
    if (this.lastPathScraped && typeof this.lastPathScraped !== 'string') {
      throw new Error('Book lastPathScraped must be a string or null');
    }
    if (!Array.isArray(this.chapters)) {
      throw new Error('Book chapters must be an array');
    }
    if (this.title !== null && this.title !== undefined && typeof this.title !== 'string') {
      throw new Error('Book title must be a string or null');
    }
    if (this.startingPath !== null && this.startingPath !== undefined && typeof this.startingPath !== 'string') {
      throw new Error('Book startingPath must be a string or null');
    }
    return true;
  }

  addChapter(chapterPath, chapterNumber = null) {
    // Check if chapter already exists
    if (this.hasChapter(chapterPath)) {
      return;
    }

    if (chapterNumber !== null) {
      // Store as object with path and number
      this.chapters.push({ path: chapterPath, number: chapterNumber });
      // Sort chapters by number
      this.chapters.sort((a, b) => {
        if (typeof a === 'string') return 1; // Legacy string entries go to end
        if (typeof b === 'string') return -1;
        return a.number - b.number;
      });
    } else {
      // Legacy: store as string
      this.chapters.push(chapterPath);
    }
  }

  hasChapter(chapterPath) {
    return this.chapters.some(ch => {
      if (typeof ch === 'string') {
        return ch === chapterPath;
      }
      return ch.path === chapterPath;
    });
  }

  getChapterPath(chapter) {
    return typeof chapter === 'string' ? chapter : chapter.path;
  }

  getChapterNumber(chapter) {
    return typeof chapter === 'string' ? null : chapter.number;
  }

  getChaptersSorted() {
    // Return chapters sorted by number (if available), otherwise maintain order
    return [...this.chapters].sort((a, b) => {
      const numA = this.getChapterNumber(a);
      const numB = this.getChapterNumber(b);
      if (numA === null && numB === null) return 0;
      if (numA === null) return 1;
      if (numB === null) return -1;
      return numA - numB;
    });
  }
}



```

```javascript
export class Book {
  constructor(id, rootSite, rootPath, plugin, lastPathScraped = null, chapters = [], title = null, startingPath = null, contentType = null) {
    this.id = id;
    this.rootSite = rootSite;
    this.rootPath = rootPath;
    this.plugin = plugin;
    this.lastPathScraped = lastPathScraped;
    this.title = title;
    this.startingPath = startingPath || rootPath; // Default to rootPath for backward compatibility
    // Chapters can be array of strings (legacy) or array of {path, number} objects
    this.chapters = Array.isArray(chapters) ? chapters : [];
    this.contentType = contentType; // 'text' or 'image' or null
  }

  static fromJSON(json) {
    // Convert chapters from JSON (handle both legacy string format and new object format)
    const chapters = (json.chapters || []).map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return new Book(
      json.id,
      json.rootSite,
      json.rootPath,
      json.plugin,
      json.lastPathScraped || null,
      chapters,
      json.title || null,
      json.startingPath || null,
      json.contentType || null
    );
  }

  toJSON() {
    // Convert chapters to JSON format (preserve structure)
    const chaptersJSON = this.chapters.map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return {
      id: this.id,
      rootSite: this.rootSite,
      rootPath: this.rootPath,
      plugin: this.plugin,
      lastPathScraped: this.lastPathScraped,
      chapters: chaptersJSON,
      ...(this.title && { title: this.title }),
      ...(this.startingPath && { startingPath: this.startingPath })
    };
  }

  validate() {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Book must have a valid id');
    }
    if (!this.rootSite || typeof this.rootSite !== 'string') {
      throw new Error('Book must have a valid rootSite');
    }
    if (!this.rootPath || typeof this.rootPath !== 'string') {
      throw new Error('Book must have a valid rootPath');
    }
    if (!this.plugin || typeof this.plugin !== 'string') {
      throw new Error('Book must have a valid plugin');
    }
    if (this.lastPathScraped && typeof this.lastPathScraped !== 'string') {
      throw new Error('Book lastPathScraped must be a string or null');
    }
    if (!Array.isArray(this.chapters)) {
      throw new Error('Book chapters must be an array');
    }
    if (this.title !== null && this.title !== undefined && typeof this.title !== 'string') {
      throw new Error('Book title must be a string or null');
    }
    if (this.startingPath !== null && this.startingPath !== undefined && typeof this.startingPath !== 'string') {
      throw new Error('Book startingPath must be a string or null');
    }
    return true;
  }

  addChapter(chapterPath, chapterNumber = null) {
    // Check if chapter already exists
    if (this.hasChapter(chapterPath)) {
      return;
    }

    if (chapterNumber !== null) {
      // Store as object with path and number
      this.chapters.push({ path: chapterPath, number: chapterNumber });
      // Sort chapters by number
      this.chapters.sort((a, b) => {
        if (typeof a === 'string') return 1; // Legacy string entries go to end
        if (typeof b === 'string') return -1;
        return a.number - b.number;
      });
    } else {
      // Legacy: store as string
      this.chapters.push(chapterPath);
    }
  }

  hasChapter(chapterPath) {
    return this.chapters.some(ch => {
      if (typeof ch === 'string') {
        return ch === chapterPath;
      }
      return ch.path === chapterPath;
    });
  }

  getChapterPath(chapter) {
    return typeof chapter === 'string' ? chapter : chapter.path;
  }

  getChapterNumber(chapter) {
    return typeof chapter === 'string' ? null : chapter.number;
  }

  getChaptersSorted() {
    // Return chapters sorted by number (if available), otherwise maintain order
    return [...this.chapters].sort((a, b) => {
      const numA = this.getChapterNumber(a);
      const numB = this.getChapterNumber(b);
      if (numA === null && numB === null) return 0;
      if (numA === null) return 1;
      if (numB === null) return -1;
      return numA - numB;
    });
  }
}



```

```javascript
export class Book {
  constructor(id, rootSite, rootPath, plugin, lastPathScraped = null, chapters = [], title = null, startingPath = null, contentType = null) {
    this.id = id;
    this.rootSite = rootSite;
    this.rootPath = rootPath;
    this.plugin = plugin;
    this.lastPathScraped = lastPathScraped;
    this.title = title;
    this.startingPath = startingPath || rootPath; // Default to rootPath for backward compatibility
    // Chapters can be array of strings (legacy) or array of {path, number} objects
    this.chapters = Array.isArray(chapters) ? chapters : [];
    this.contentType = contentType; // 'text' or 'image' or null
  }

  static fromJSON(json) {
    // Convert chapters from JSON (handle both legacy string format and new object format)
    const chapters = (json.chapters || []).map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return new Book(
      json.id,
      json.rootSite,
      json.rootPath,
      json.plugin,
      json.lastPathScraped || null,
      chapters,
      json.title || null,
      json.startingPath || null,
      json.contentType || null
    );
  }

  toJSON() {
    // Convert chapters to JSON format (preserve structure)
    const chaptersJSON = this.chapters.map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return {
      id: this.id,
      rootSite: this.rootSite,
      rootPath: this.rootPath,
      plugin: this.plugin,
      lastPathScraped: this.lastPathScraped,
      chapters: chaptersJSON,
      ...(this.title && { title: this.title }),
      ...(this.startingPath && { startingPath: this.startingPath }),
      ...(this.contentType && { contentType: this.contentType })
    };
  }

  validate() {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Book must have a valid id');
    }
    if (!this.rootSite || typeof this.rootSite !== 'string') {
      throw new Error('Book must have a valid rootSite');
    }
    if (!this.rootPath || typeof this.rootPath !== 'string') {
      throw new Error('Book must have a valid rootPath');
    }
    if (!this.plugin || typeof this.plugin !== 'string') {
      throw new Error('Book must have a valid plugin');
    }
    if (this.lastPathScraped && typeof this.lastPathScraped !== 'string') {
      throw new Error('Book lastPathScraped must be a string or null');
    }
    if (!Array.isArray(this.chapters)) {
      throw new Error('Book chapters must be an array');
    }
    if (this.title !== null && this.title !== undefined && typeof this.title !== 'string') {
      throw new Error('Book title must be a string or null');
    }
    if (this.startingPath !== null && this.startingPath !== undefined && typeof this.startingPath !== 'string') {
      throw new Error('Book startingPath must be a string or null');
    }
    return true;
  }

  addChapter(chapterPath, chapterNumber = null) {
    // Check if chapter already exists
    if (this.hasChapter(chapterPath)) {
      return;
    }

    if (chapterNumber !== null) {
      // Store as object with path and number
      this.chapters.push({ path: chapterPath, number: chapterNumber });
      // Sort chapters by number
      this.chapters.sort((a, b) => {
        if (typeof a === 'string') return 1; // Legacy string entries go to end
        if (typeof b === 'string') return -1;
        return a.number - b.number;
      });
    } else {
      // Legacy: store as string
      this.chapters.push(chapterPath);
    }
  }

  hasChapter(chapterPath) {
    return this.chapters.some(ch => {
      if (typeof ch === 'string') {
        return ch === chapterPath;
      }
      return ch.path === chapterPath;
    });
  }

  getChapterPath(chapter) {
    return typeof chapter === 'string' ? chapter : chapter.path;
  }

  getChapterNumber(chapter) {
    return typeof chapter === 'string' ? null : chapter.number;
  }

  getChaptersSorted() {
    // Return chapters sorted by number (if available), otherwise maintain order
    return [...this.chapters].sort((a, b) => {
      const numA = this.getChapterNumber(a);
      const numB = this.getChapterNumber(b);
      if (numA === null && numB === null) return 0;
      if (numA === null) return 1;
      if (numB === null) return -1;
      return numA - numB;
    });
  }
}



```

```javascript
export class Book {
  constructor(id, rootSite, rootPath, plugin, lastPathScraped = null, chapters = [], title = null, startingPath = null, contentType = null) {
    this.id = id;
    this.rootSite = rootSite;
    this.rootPath = rootPath;
    this.plugin = plugin;
    this.lastPathScraped = lastPathScraped;
    this.title = title;
    this.startingPath = startingPath || rootPath; // Default to rootPath for backward compatibility
    // Chapters can be array of strings (legacy) or array of {path, number} objects
    this.chapters = Array.isArray(chapters) ? chapters : [];
    this.contentType = contentType; // 'text' or 'image' or null
  }

  static fromJSON(json) {
    // Convert chapters from JSON (handle both legacy string format and new object format)
    const chapters = (json.chapters || []).map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return new Book(
      json.id,
      json.rootSite,
      json.rootPath,
      json.plugin,
      json.lastPathScraped || null,
      chapters,
      json.title || null,
      json.startingPath || null,
      json.contentType || null
    );
  }

  toJSON() {
    // Convert chapters to JSON format (preserve structure)
    const chaptersJSON = this.chapters.map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return {
      id: this.id,
      rootSite: this.rootSite,
      rootPath: this.rootPath,
      plugin: this.plugin,
      lastPathScraped: this.lastPathScraped,
      chapters: chaptersJSON,
      ...(this.title && { title: this.title }),
      ...(this.startingPath && { startingPath: this.startingPath }),
      ...(this.contentType && { contentType: this.contentType })
    };
  }

  validate() {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Book must have a valid id');
    }
    if (!this.rootSite || typeof this.rootSite !== 'string') {
      throw new Error('Book must have a valid rootSite');
    }
    if (!this.rootPath || typeof this.rootPath !== 'string') {
      throw new Error('Book must have a valid rootPath');
    }
    if (!this.plugin || typeof this.plugin !== 'string') {
      throw new Error('Book must have a valid plugin');
    }
    if (this.lastPathScraped && typeof this.lastPathScraped !== 'string') {
      throw new Error('Book lastPathScraped must be a string or null');
    }
    if (!Array.isArray(this.chapters)) {
      throw new Error('Book chapters must be an array');
    }
    if (this.title !== null && this.title !== undefined && typeof this.title !== 'string') {
      throw new Error('Book title must be a string or null');
    }
    if (this.startingPath !== null && this.startingPath !== undefined && typeof this.startingPath !== 'string') {
      throw new Error('Book startingPath must be a string or null');
    }
    if (this.contentType !== null && this.contentType !== undefined && this.contentType !== 'text' && this.contentType !== 'image') {
      throw new Error('Book contentType must be "text", "image", or null');
    }
    return true;
  }

  addChapter(chapterPath, chapterNumber = null) {
    // Check if chapter already exists
    if (this.hasChapter(chapterPath)) {
      return;
    }

    if (chapterNumber !== null) {
      // Store as object with path and number
      this.chapters.push({ path: chapterPath, number: chapterNumber });
      // Sort chapters by number
      this.chapters.sort((a, b) => {
        if (typeof a === 'string') return 1; // Legacy string entries go to end
        if (typeof b === 'string') return -1;
        return a.number - b.number;
      });
    } else {
      // Legacy: store as string
      this.chapters.push(chapterPath);
    }
  }

  hasChapter(chapterPath) {
    return this.chapters.some(ch => {
      if (typeof ch === 'string') {
        return ch === chapterPath;
      }
      return ch.path === chapterPath;
    });
  }

  getChapterPath(chapter) {
    return typeof chapter === 'string' ? chapter : chapter.path;
  }

  getChapterNumber(chapter) {
    return typeof chapter === 'string' ? null : chapter.number;
  }

  getChaptersSorted() {
    // Return chapters sorted by number (if available), otherwise maintain order
    return [...this.chapters].sort((a, b) => {
      const numA = this.getChapterNumber(a);
      const numB = this.getChapterNumber(b);
      if (numA === null && numB === null) return 0;
      if (numA === null) return 1;
      if (numB === null) return -1;
      return numA - numB;
    });
  }
}



```

Updating the `add-book` command to automatically set `contentType` from the plugin:


Updating the `add-book` command to automatically set `contentType` from the plugin:


Updating the `add-book` command to automatically determine `contentType` from the plugin:


```javascript
#!/usr/bin/env node

import { Command } from 'commander';
import { DataManager } from '../data/DataManager.js';
import { RootSite } from '../models/RootSite.js';
import { Book } from '../models/Book.js';
import { ScraperEngine } from '../scraper/ScraperEngine.js';
import { PluginLoader } from '../scraper/PluginLoader.js';

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
  .option('--debug', 'Enable debug logging output')
  .action(async (bookId, options) => {
    try {
      const engine = new ScraperEngine();
      await engine.scrapeBook(bookId, options.forceSave || false, options.debug || false);
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
      await engine.scrapeBookReverse(bookId, initialChapterNum, options.forceSave || false, options.debug || false);
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
  .option('--debug', 'Enable debug logging output')
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
      await engine.scrapeBook(bookId, options.forceSave || false, options.debug || false);
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




```

```javascript
#!/usr/bin/env node

import { Command } from 'commander';
import { DataManager } from '../data/DataManager.js';
import { RootSite } from '../models/RootSite.js';
import { Book } from '../models/Book.js';
import { ScraperEngine } from '../scraper/ScraperEngine.js';
import { PluginLoader } from '../scraper/PluginLoader.js';

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
  .option('--debug', 'Enable debug logging output')
  .action(async (bookId, options) => {
    try {
      const engine = new ScraperEngine();
      await engine.scrapeBook(bookId, options.forceSave || false, options.debug || false);
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
      await engine.scrapeBookReverse(bookId, initialChapterNum, options.forceSave || false, options.debug || false);
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

      const book = new Book(id, rootSite, normalizedRootPath, plugin, null, [], options.title || null, startingPath, contentType);
      await dataManager.addBook(book);
      console.log(`✓ Added book: ${id}`);
      if (book.title) {
        console.log(`  Title: ${book.title}`);
      }
      console.log(`  Root site: ${rootSite}`);
      console.log(`  Root path: ${normalizedRootPath}`);
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
  .option('--debug', 'Enable debug logging output')
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
      await engine.scrapeBook(bookId, options.forceSave || false, options.debug || false);
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




```

Checking for linter errors:


Checking for other places where Book is instantiated that might need updates:


## Summary

Added a `contentType` enum field to the Book model.

1. **Updated `Book` model** (`src/models/Book.js`):
   - Added `contentType` parameter to the constructor (defaults to `null` for backward compatibility)
   - Updated `fromJSON()` to read `contentType` from JSON
   - Updated `toJSON()` to include `contentType` when present
   - Added validation to ensure `contentType` is `'text'`, `'image'`, or `null`

2. **Updated `add-book` command** (`src/cli/index.js`):
   - Imports `PluginLoader`
   - Automatically determines `contentType` from the plugin's `getContentType()` method when creating a new book
   - Displays the `contentType` in the output
   - Handles cases where the plugin cannot be loaded (warns and sets `contentType` to `null`)

The implementation:
- Maintains backward compatibility (existing books without `contentType` will have it as `null`)
- Automatically sets `contentType` for new books based on the plugin
- Validates that `contentType` is one of the allowed enum values
- Follows the existing code patterns in the codebase

The `contentType` field will be stored in the `books.json` file and can be `'text'`, `'image'`, or `null` (for legacy books or when the plugin cannot be loaded).

