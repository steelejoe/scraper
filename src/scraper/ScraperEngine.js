import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { DataManager } from '../data/DataManager.js';
import { PluginLoader } from './PluginLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.join(__dirname, '../../content');

export class ScraperEngine {
  constructor() {
    this.dataManager = new DataManager();
    this.pluginLoader = new PluginLoader();
    fs.ensureDirSync(CONTENT_DIR);
  }

  async scrapeBook(bookId) {
    // Load book and root site data
    const book = await this.dataManager.getBook(bookId);
    if (!book) {
      throw new Error(`Book with id ${bookId} not found`);
    }

    const rootSite = await this.dataManager.getRootSite(book.rootSite);
    if (!rootSite) {
      throw new Error(`Root site ${book.rootSite} not found`);
    }

    // Load appropriate plugin
    const plugin = await this.pluginLoader.loadPlugin(book.plugin);

    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Login if credentials exist
      if (rootSite.credentials && plugin.login) {
        console.log(`Logging in to ${rootSite.domain}...`);
        await plugin.login(rootSite.credentials, page);
        console.log('Login successful');
      }

      // Determine starting URL
      let currentUrl = null;
      if (book.lastPathScraped) {
        // Resume from last scraped path
        currentUrl = this.buildUrl(rootSite.domain, book.lastPathScraped);
        console.log(`Resuming from: ${currentUrl}`);
      } else {
        // Start from root path
        currentUrl = this.buildUrl(rootSite.domain, book.rootPath);
        console.log(`Starting from: ${currentUrl}`);
      }

      // Sequential scraping loop
      let chapterCount = 0;
      while (currentUrl) {
        try {
          console.log(`\nScraping: ${currentUrl}`);

          // Navigate to current chapter URL
          await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 30000 });

          // Scroll to load full content
          await this.scrollPage(page);

          // Check if page has content
          const hasContent = await plugin.hasContent(page);
          if (!hasContent) {
            console.log('No content detected on page');
            // Try to get next chapter URL - if this was the last scraped page and it's now empty,
            // we should try the next page instead of stopping
            const nextUrl = await plugin.getNextChapterUrl(page);
            if (nextUrl) {
              const nextPath = this.extractPathFromUrl(nextUrl);
              if (!book.hasChapter(nextPath)) {
                console.log('Trying next chapter instead...');
                currentUrl = nextUrl;
                continue;
              }
            }
            console.log('Stopping scrape - no content and no valid next chapter');
            break;
          }

          // Extract content using plugin
          const chapterData = await plugin.scrapeChapter(currentUrl, page, {
            scrollDelay: 1000,
            maxScrolls: 10
          });

          // Format and save content
          const chapterPath = this.extractPathFromUrl(currentUrl);
          // Get previous chapter path if it exists
          const prevChapterPath = book.chapters.length > 0 ? book.chapters[book.chapters.length - 1] : null;
          
          // Save current chapter with previous link (next will be plain text for now)
          await this.saveChapter(bookId, chapterPath, chapterData, plugin.getContentType(), prevChapterPath);
          
          // Update previous chapter's "next" link if it exists
          if (prevChapterPath) {
            await this.updateChapterNavigation(bookId, prevChapterPath, chapterPath);
          }

          // Update book metadata
          book.addChapter(chapterPath);
          book.lastPathScraped = chapterPath;
          await this.dataManager.updateBook(bookId, {
            chapters: book.chapters,
            lastPathScraped: book.lastPathScraped
          });

          chapterCount++;
          console.log(`✓ Saved chapter: ${chapterData.title}`);

          // Get next chapter URL
          const nextUrl = await plugin.getNextChapterUrl(page);
          
          if (!nextUrl) {
            console.log('No next chapter found, scraping complete');
            break;
          }

          // Check if next chapter was already scraped
          const nextPath = this.extractPathFromUrl(nextUrl);
          if (book.hasChapter(nextPath)) {
            console.log('Next chapter already scraped, stopping');
            break;
          }

          currentUrl = nextUrl;

        } catch (error) {
          console.error(`Error scraping ${currentUrl}:`, error.message);
          // Continue to next chapter if possible, or break on critical errors
          const nextUrl = await plugin.getNextChapterUrl(page).catch(() => null);
          if (!nextUrl) {
            throw error; // Re-throw if we can't continue
          }
          currentUrl = nextUrl;
        }
      }

      console.log(`\nScraping complete. Scraped ${chapterCount} chapter(s).`);

    } finally {
      await browser.close();
    }
  }

  buildUrl(domain, path) {
    const protocol = domain.includes('localhost') ? 'http' : 'https';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${protocol}://${domain}${cleanPath}`;
  }

  extractPathFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname + urlObj.search;
    } catch {
      return url;
    }
  }

  async scrollPage(page) {
    let scrollCount = 0;
    let lastHeight = 0;
    let currentHeight = 0;
    const maxScrolls = 10;
    const delay = 1000;

    do {
      lastHeight = currentHeight;
      currentHeight = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return document.body.scrollHeight;
      });
      
      await page.waitForTimeout(delay);
      scrollCount++;
    } while (currentHeight !== lastHeight && scrollCount < maxScrolls);
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  async saveChapter(bookId, chapterPath, chapterData, contentType, prevChapterPath = null) {
    const bookContentDir = path.join(CONTENT_DIR, bookId);
    await fs.ensureDir(bookContentDir);

    // Sanitize chapter path for filename
    const sanitizedPath = chapterPath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'index';

    const filename = `${sanitizedPath}.md`;
    const filePath = path.join(bookContentDir, filename);

    // Generate navigation links
    // Previous: link if exists, plain text if not
    // Next: always plain text (will be updated when next chapter is saved)
    const navigation = this.generateNavigation(prevChapterPath, null);

    // Format markdown content
    let markdown = `# ${chapterData.title}\n\n`;
    
    // Add navigation at the top
    if (navigation) {
      markdown += `${navigation}\n\n`;
    }
    
    if (contentType === 'image' && chapterData.images && chapterData.images.length > 0) {
      // Add images
      for (const imageUrl of chapterData.images) {
        markdown += `![Image](${imageUrl})\n\n`;
      }
    } else {
      // Add text content
      markdown += chapterData.content;
    }

    // Add navigation at the bottom as well
    if (navigation) {
      markdown += `\n\n---\n\n${navigation}`;
    }

    await fs.writeFile(filePath, markdown, 'utf8');
  }

  generateNavigation(prevChapterPath, nextChapterPath) {
    const navParts = [];

    // Previous chapter
    if (prevChapterPath) {
      const prevSanitized = prevChapterPath
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'index';
      navParts.push(`[← Previous Chapter](${prevSanitized}.md)`);
    } else {
      navParts.push('← Previous Chapter');
    }

    // Separator
    navParts.push(' | ');

    // Next chapter
    if (nextChapterPath) {
      const nextSanitized = nextChapterPath
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'index';
      navParts.push(`[Next Chapter →](${nextSanitized}.md)`);
    } else {
      navParts.push('Next Chapter →');
    }

    return navParts.join('');
  }

  async updateChapterNavigation(bookId, chapterPath, nextChapterPath) {
    const bookContentDir = path.join(CONTENT_DIR, bookId);
    
    // Sanitize paths for filenames
    const sanitizedPath = chapterPath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'index';
    
    const nextSanitized = nextChapterPath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'index';

    const filename = `${sanitizedPath}.md`;
    const filePath = path.join(bookContentDir, filename);

    // Check if file exists
    if (!(await fs.pathExists(filePath))) {
      return; // File doesn't exist, skip update
    }

    // Read the file
    let content = await fs.readFile(filePath, 'utf8');

    // Replace plain text "Next Chapter →" with link
    // Pattern matches: (previous chapter part) | Next Chapter →
    // Where previous chapter part can be either plain text or a link
    const linkNext = `[Next Chapter →](${nextSanitized}.md)`;
    
    // Match pattern: anything before " | Next Chapter →" (plain text)
    // This handles both top and bottom navigation
    const navPattern = /((?:\[← Previous Chapter\]\([^)]+\)|← Previous Chapter) \| )Next Chapter →/g;
    content = content.replace(navPattern, `$1${linkNext}`);

    // Write the updated content back
    await fs.writeFile(filePath, content, 'utf8');
  }
}



