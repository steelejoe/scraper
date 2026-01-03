# Manhuaus.org image content plugin
_Exported on 1/3/2026 at 10:39:24 PST from Cursor (2.3.15)_

---

**User**

Add a new plugin to support the manhuas.org site. This is a sample chapter https://manhuaus.org/manga/the-worlds-best-engineer/chapter-177/ You can use the existing plugins as a template, but with a significant difference. Rather than text content, the primary content is a set of images. The chapter Markdown file should display the series of images in the same order they appear on the original page. Each chapter should have its own sub-folder that contains the downloaded images.

---

**Cursor**

Reviewing existing plugin structure to understand the pattern before creating the manhuaus.org plugin.


Checking image handling and how the scraper downloads files:


Checking package.json for dependencies:


Creating the manhuaus.org plugin and updating ScraperEngine to download images. Examining the full ScraperEngine saveChapter method to understand the flow:


Creating the manhuaus.org plugin and updating ScraperEngine to download and save images. Checking where saveChapter is called:


Creating the manhuaus.org plugin and updating ScraperEngine to download images. Starting with the plugin:


```javascript
/**
 * Plugin for manhuaus.org
 * 
 * This plugin scrapes manga chapter content from manhuaus.org.
 * Chapters contain images that need to be downloaded and saved in chapter subfolders.
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    const nextLink = await page.evaluate(() => {
      // Look for "Next" button or link
      // Common patterns: "Next", "Next Chapter", links with "Next" text
      const nextButtons = document.querySelectorAll('a');
      
      for (const link of nextButtons) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "next"
        if ((text === 'next' || text.includes('next chapter')) && 
            href && 
            href !== window.location.href && 
            !href.includes('javascript:') &&
            !href.includes('#')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns common in manga sites
      const nextById = document.getElementById('next');
      if (nextById && nextById.href) {
        return nextById.href;
      }
      
      // Try finding by title attribute
      const nextByTitle = document.querySelector('a[title*="Next"], a[title*="next"]');
      if (nextByTitle && nextByTitle.href && nextByTitle.href !== window.location.href) {
        return nextByTitle.href;
      }
      
      return null;
    });

    return nextLink || null;
  } catch (error) {
    console.error('Error getting next chapter URL:', error);
    return null;
  }
}

/**
 * Extracts the "previous chapter" URL from the current page.
 */
export async function getPreviousChapterUrl(page) {
  try {
    const prevLink = await page.evaluate(() => {
      // Look for "Previous" or "Prev" button or link
      const prevButtons = document.querySelectorAll('a');
      
      for (const link of prevButtons) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "previous"
        if ((text === 'prev' || text === 'previous' || text.includes('previous chapter')) && 
            href && 
            href !== window.location.href && 
            !href.includes('javascript:') &&
            !href.includes('#')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns
      const prevById = document.getElementById('prev');
      if (prevById && prevById.href) {
        return prevById.href;
      }
      
      // Try finding by title attribute
      const prevByTitle = document.querySelector('a[title*="Prev"], a[title*="prev"], a[title*="Previous"], a[title*="previous"]');
      if (prevByTitle && prevByTitle.href && prevByTitle.href !== window.location.href) {
        return prevByTitle.href;
      }
      
      return null;
    });

    return prevLink || null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content (images).
 */
export async function hasContent(page, options = {}) {
  const debug = options.debug || false;
  try {
    const hasImages = await page.evaluate(() => {
      // Look for manga images - typically in containers like .reading-content, .chapter-content, etc.
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article img',
        '.content img',
        'main img'
      ];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        // Filter out logos, ads, and navigation images
        const validImages = Array.from(images).filter(img => {
          const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
          if (!src) return false;
          
          // Exclude common non-content images
          const lowerSrc = src.toLowerCase();
          return !lowerSrc.includes('logo') && 
                 !lowerSrc.includes('banner') && 
                 !lowerSrc.includes('ad') &&
                 !lowerSrc.includes('avatar') &&
                 !lowerSrc.includes('icon');
        });
        
        if (validImages.length > 0) {
          return true;
        }
      }
      
      return false;
    });
    
    if (debug) {
      console.log('[DEBUG hasContent] Has images:', hasImages);
    }
    
    return hasImages;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrolls the page to load lazy-loaded content.
 */
async function scrollPage(page, scrollDelay = 400, maxScrolls = 10) {
  let lastHeight = 0;
  let scrollCount = 0;
  
  while (scrollCount < maxScrolls) {
    // Get current scroll position and page height
    const { currentHeight, totalHeight } = await page.evaluate(() => {
      return {
        currentHeight: window.innerHeight + window.scrollY,
        totalHeight: document.body.scrollHeight
      };
    });
    
    // Scroll down
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    
    await page.waitForTimeout(scrollDelay);
    
    // Check if we've reached the bottom
    const newHeight = await page.evaluate(() => window.innerHeight + window.scrollY);
    if (newHeight === lastHeight && newHeight >= totalHeight - 100) {
      break; // Reached bottom
    }
    
    lastHeight = newHeight;
    scrollCount++;
  }
  
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(scrollDelay);
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  const debug = options.debug || false;
  try {
    if (debug) console.log('[DEBUG scrapeChapter] Starting scrape for:', url);
    
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      if (debug) console.log('[DEBUG scrapeChapter] Page loaded');
    }
    
    // Wait a bit for page to fully load
    await page.waitForTimeout(2000);
    
    // Scroll to load lazy-loaded images
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);
    if (debug) console.log('[DEBUG scrapeChapter] Finished scrolling');
    
    // Extract title and chapter number
    const { title, chapterNumber } = await page.evaluate(() => {
      let titleText = null;
      let chapterNum = null;
      
      // Try multiple title selectors
      const titleSelectors = [
        'h1',
        '.chapter-title',
        '.entry-title',
        'title'
      ];
      
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          titleText = el.textContent.trim();
          break;
        }
      }
      
      // If no title found, try to extract from page title
      if (!titleText) {
        titleText = document.title;
      }
      
      // Extract chapter number from title or URL
      const chapterMatch = titleText.match(/Chapter\s+(\d+)/i) || 
                          window.location.pathname.match(/chapter-(\d+)/i);
      if (chapterMatch) {
        chapterNum = parseFloat(chapterMatch[1]);
      }
      
      // Clean up title - remove site name and other metadata
      if (titleText) {
        titleText = titleText
          .replace(/\s*[-–—]\s*Manhuaus[^]*$/i, '')
          .replace(/\s*[-–—]\s*Manhua[^]*$/i, '')
          .trim();
      }
      
      return {
        title: titleText || 'Untitled Chapter',
        chapterNumber: chapterNum
      };
    });
    
    // Extract images - look for manga page images
    const imageUrls = await page.evaluate(() => {
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article .wp-block-image img',
        'article img',
        '.content img',
        'main img'
      ];
      
      const allImages = [];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        if (images.length > 0) {
          Array.from(images).forEach(img => {
            const src = img.src || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-lazy-src') ||
                       img.getAttribute('data-original');
            
            if (src) {
              // Convert relative URLs to absolute
              const absoluteSrc = src.startsWith('http') ? src : new URL(src, window.location.href).href;
              
              // Filter out non-content images
              const lowerSrc = absoluteSrc.toLowerCase();
              if (!lowerSrc.includes('logo') && 
                  !lowerSrc.includes('banner') && 
                  !lowerSrc.includes('ad') &&
                  !lowerSrc.includes('avatar') &&
                  !lowerSrc.includes('icon') &&
                  !lowerSrc.includes('placeholder')) {
                allImages.push(absoluteSrc);
              }
            }
          });
          
          // If we found images with this selector, use them (likely the correct one)
          if (allImages.length > 0) {
            break;
          }
        }
      }
      
      // Remove duplicates while preserving order
      return Array.from(new Set(allImages));
    });
    
    if (debug) {
      console.log(`[DEBUG scrapeChapter] Extracted ${imageUrls.length} images`);
    }
    
    if (imageUrls.length === 0) {
      throw new Error('No images found on page');
    }
    
    return {
      title,
      content: '', // No text content for manga
      chapterNumber,
      images: imageUrls
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type this plugin handles.
 */
export function getContentType() {
  return 'image';
}

/**
 * Returns whether this site uses Cloudflare protection.
 */
export function isCloudflarePage() {
  return false; // Update if site uses Cloudflare
}

```

Updating ScraperEngine to download images and save them in chapter subfolders:


Updating ScraperEngine to download images and save them in chapter subfolders:


```javascript
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { DataManager } from '../data/DataManager.js';
import { PluginLoader } from './PluginLoader.js';

// Use stealth plugin to help bypass Cloudflare and other bot detection
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.join(__dirname, '../../content');

export class ScraperEngine {
  constructor() {
    this.dataManager = new DataManager();
    this.pluginLoader = new PluginLoader();
    fs.ensureDirSync(CONTENT_DIR);
    this.errors = []; // Accumulate errors during scraping
  }

  async scrapeBook(bookId, forceSave = false, debug = false) {
    // Reset errors for this scraping session
    this.errors = [];
    
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

    // Check if plugin indicates Cloudflare protection is used
    // Use non-headless mode for Cloudflare sites (harder for Cloudflare to detect)
    const usesCloudflare = plugin.isCloudflarePage ? plugin.isCloudflarePage() : false;
    const headlessMode = usesCloudflare ? false : 'new';

    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
      headless: headlessMode,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ]
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
      // Priority: 1. lastPathScraped, 2. startingPath, 3. Error if neither defined
      let currentUrl = null;
      if (book.lastPathScraped) {
        // Resume from last scraped path
        currentUrl = this.buildUrl(rootSite.domain, book.lastPathScraped);
        console.log(`Resuming from: ${currentUrl}`);
      } else if (book.startingPath) {
        // Start from starting path
        currentUrl = this.buildUrl(rootSite.domain, book.startingPath);
        console.log(`Starting from: ${currentUrl}`);
      } else {
        // Neither lastPathScraped nor startingPath is defined
        throw new Error(`Cannot start scraping: both lastPathScraped and startingPath are undefined for book ${bookId}. Please set a startingPath when adding the book.`);
      }

      // Sequential scraping loop
      let chapterCount = 0;
      while (currentUrl) {
        try {
          console.log(`\nScraping: ${currentUrl}`);

          // Navigate to current chapter URL
          // Use 'domcontentloaded' for faster page loads (optimization)
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // Scroll to load full content
          await this.scrollPage(page);

          // Check if page has content
          const hasContent = await plugin.hasContent(page, { debug });
          if (!hasContent) {
            console.log('No content detected on page');
            // Try to get next chapter URL - if this was the last scraped page and it's now empty,
            // we should try the next page instead of stopping
            const nextUrl = await plugin.getNextChapterUrl(page);
            if (nextUrl) {
              // Validate that URL contains root path
              const urlValidation = this.validateUrlContainsRootPath(nextUrl, book.rootPath);
              if (!urlValidation.valid) {
                const errorMsg = `Next chapter URL does not match root path: ${urlValidation.reason}`;
                console.error(`Error: ${errorMsg}`);
                this.errors.push({ url: nextUrl, type: 'url_validation_error', message: errorMsg });
                console.log(`Stopping scrape - next URL does not contain root path: ${urlValidation.reason}`);
                break;
              }
              
              // Update lastPathScraped before moving to next chapter
              const currentPath = this.extractPathFromUrl(currentUrl);
              book.lastPathScraped = currentPath;
              await this.dataManager.updateBook(bookId, {
                lastPathScraped: book.lastPathScraped
              });
              
              console.log('Trying next chapter instead...');
              currentUrl = nextUrl;
              continue;
            }
            console.log('Stopping scrape - no content and no valid next chapter');
            break;
          }

          // Extract content using plugin
          // Reduced scrollDelay from 1000ms to 400ms for faster processing (optimization)
          const chapterData = await plugin.scrapeChapter(currentUrl, page, {
            scrollDelay: 400,
            maxScrolls: 10,
            debug
          });

          // Update book title if not set and plugin provides it
          if (!book.title && chapterData.bookTitle) {
            book.title = chapterData.bookTitle;
            await this.dataManager.updateBook(bookId, { title: book.title });
            console.log(`✓ Set book title: ${book.title}`);
          }

          // Format and save content
          const chapterPath = this.extractPathFromUrl(currentUrl);
          
          // Check if chapter was already scraped
          const alreadyScraped = book.hasChapter(chapterPath);
          
          // Save chapter if not already scraped, or if forceSave is enabled
          if (!alreadyScraped || forceSave) {
            // Get chapter number from scraped data, or try to extract from URL as fallback
            let chapterNumber = chapterData.chapterNumber;
            if (chapterNumber === undefined || chapterNumber === null) {
              // Try to extract from URL as fallback (supports both integers and decimals)
              const chapterMatch = currentUrl.match(/chapter[_-]?(\d+\.?\d*)/i);
              if (chapterMatch) {
                chapterNumber = parseFloat(chapterMatch[1]);
                const errorMsg = `Could not determine chapter number for ${currentUrl}, extracted from URL: ${chapterNumber}`;
                console.warn(`⚠ ${errorMsg}`);
                this.errors.push({ url: currentUrl, type: 'chapter_number', message: errorMsg });
              } else {
                // Use sequential numbering as last resort
                chapterNumber = book.chapters.length + 1;
                const errorMsg = `Could not determine chapter number for ${currentUrl}, using sequential fallback: ${chapterNumber}`;
                console.warn(`⚠ ${errorMsg}`);
                this.errors.push({ url: currentUrl, type: 'chapter_number', message: errorMsg });
              }
            }
            
            // Add chapter with number to book (only if not already added)
            if (!alreadyScraped) {
              book.addChapter(chapterPath, chapterNumber);
            }
            
            // Get sorted chapters to find previous/next
            const sortedChapters = book.getChaptersSorted();
            const currentIndex = sortedChapters.findIndex(ch => {
              const chPath = book.getChapterPath(ch);
              return chPath === chapterPath;
            });
            
            const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
            const nextChapter = currentIndex >= 0 && currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;
            
            const prevChapterPath = prevChapter ? book.getChapterPath(prevChapter) : null;
            const nextChapterPath = nextChapter ? book.getChapterPath(nextChapter) : null;
            
            // Save current chapter with navigation
            await this.saveChapter(bookId, chapterPath, chapterData, plugin.getContentType(), prevChapterPath, nextChapterPath, currentUrl);
            
            // Update previous chapter's "next" link if it exists
            if (prevChapterPath) {
              await this.updateChapterNavigation(bookId, prevChapterPath, chapterPath);
            }
            
            // Update next chapter's "previous" link if it exists (in case we're inserting in the middle)
            if (nextChapterPath) {
              await this.updateChapterNavigation(bookId, nextChapterPath, chapterPath, true);
            }

            chapterCount++;
            if (alreadyScraped && forceSave) {
              console.log(`✓ Force saved chapter (overwrote existing): ${chapterData.title}`);
            } else {
              console.log(`✓ Saved chapter: ${chapterData.title}`);
            }
            
            // Update TOC after saving chapter
            await this.generateTOC(bookId);
          } else {
            console.log(`⊘ Chapter already scraped, skipping: ${chapterData.title}`);
            // Still update TOC to ensure it's current (in case chapters were added/updated elsewhere)
            await this.generateTOC(bookId);
          }

          // Update book metadata (always update lastPathScraped, even if chapter was already scraped)
          book.lastPathScraped = chapterPath;
          await this.dataManager.updateBook(bookId, {
            chapters: book.chapters,
            lastPathScraped: book.lastPathScraped
          });

          // Get next chapter URL
          const nextUrl = await plugin.getNextChapterUrl(page);
          
          if (!nextUrl) {
            console.log('No next chapter found, scraping complete');
            break;
          }

          // Validate that URL contains root path
          const urlValidation = this.validateUrlContainsRootPath(nextUrl, book.rootPath);
          if (!urlValidation.valid) {
            const errorMsg = `Next chapter URL does not match root path: ${urlValidation.reason}`;
            console.error(`Error: ${errorMsg}`);
            this.errors.push({ url: nextUrl, type: 'url_validation_error', message: errorMsg });
            console.log(`Stopping scrape - next URL does not contain root path: ${urlValidation.reason}`);
            break;
          }

          // Continue to next chapter even if it's already scraped
          currentUrl = nextUrl;

        } catch (error) {
          const errorMsg = `Error scraping ${currentUrl}: ${error.message}`;
          console.error(errorMsg);
          this.errors.push({ url: currentUrl, type: 'scraping_error', message: errorMsg });
          
          // Continue to next chapter if possible, or break on critical errors
          const nextUrl = await plugin.getNextChapterUrl(page).catch(() => null);
          if (!nextUrl) {
            throw error; // Re-throw if we can't continue
          }
          
          // Validate that URL contains root path
          const urlValidation = this.validateUrlContainsRootPath(nextUrl, book.rootPath);
          if (!urlValidation.valid) {
            const errorMsg = `Next chapter URL does not match root path: ${urlValidation.reason}`;
            console.error(`Error: ${errorMsg}`);
            this.errors.push({ url: nextUrl, type: 'url_validation_error', message: errorMsg });
            console.log(`Stopping scrape - next URL does not contain root path: ${urlValidation.reason}`);
            throw error; // Re-throw the original error
          }
          
          currentUrl = nextUrl;
        }
      }

      console.log(`\nScraping complete. Scraped ${chapterCount} chapter(s).`);
      
      // Report accumulated errors
      this.reportErrors();

    } finally {
      await browser.close();
    }
  }

  async scrapeBookReverse(bookId, initialChapterNumber = null, forceSave = false, debug = false) {
    // Reset errors for this scraping session
    this.errors = [];
    
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

    // Check if plugin indicates Cloudflare protection is used
    // Use non-headless mode for Cloudflare sites (harder for Cloudflare to detect)
    const usesCloudflare = plugin.isCloudflarePage ? plugin.isCloudflarePage() : false;
    const headlessMode = usesCloudflare ? false : 'new';

    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
      headless: headlessMode,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ]
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
      // Priority: 1. lastPathScraped, 2. startingPath, 3. Error if neither defined
      let startPath = null;
      if (book.lastPathScraped) {
        startPath = book.lastPathScraped;
        console.log(`Resuming from last scraped path: ${startPath}`);
      } else if (book.startingPath) {
        startPath = book.startingPath;
        console.log(`Starting from starting path: ${startPath}`);
      } else {
        // Neither lastPathScraped nor startingPath is defined
        throw new Error(`Cannot start reverse scraping: both lastPathScraped and startingPath are undefined for book ${bookId}. Please set a startingPath when adding the book.`);
      }
      
      let currentUrl = this.buildUrl(rootSite.domain, startPath);
      
      // If chapter number not provided, scrape the initial page to get it
      let chapterNumber = initialChapterNumber;
      if (chapterNumber === null || chapterNumber === undefined) {
        console.log(`No chapter number provided. Scraping initial page to determine chapter number...`);
        console.log(`Navigating to: ${currentUrl}`);
        
        await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.scrollPage(page);
        
        // Check if page has content
        const hasContent = await plugin.hasContent(page, { debug });
        if (!hasContent) {
          throw new Error('Initial page has no content. Cannot determine chapter number.');
        }

        // Scrape the initial page to get chapter number
        const initialChapterData = await plugin.scrapeChapter(currentUrl, page, {
          scrollDelay: 1000,
          maxScrolls: 10,
          debug
        });
        
        if (!initialChapterData.chapterNumber) {
          throw new Error('Could not determine chapter number from initial page. Please provide chapter number explicitly.');
        }
        
        chapterNumber = initialChapterData.chapterNumber;
        console.log(`Determined chapter number: ${chapterNumber}`);
      }
      
      console.log(`Starting reverse scrape from: ${currentUrl} (Chapter ${chapterNumber})`);

      // Sequential reverse scraping loop
      let chapterCount = 0;
      let lastChapterNumber = chapterNumber; // Track last chapter number for fallback calculation
      while (currentUrl) {
        try {
          console.log(`\nScraping: ${currentUrl}`);

          // Navigate to current chapter URL
          // Use 'domcontentloaded' for faster page loads (optimization)
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // Scroll to load full content
          await this.scrollPage(page);

          // Check if page has content
          const hasContent = await plugin.hasContent(page, { debug });
          if (!hasContent) {
            console.log('No content detected on page');
            // Try to get previous chapter URL - if this was the last scraped page and it's now empty,
            // we should try the previous page instead of stopping
            const prevUrl = await plugin.getPreviousChapterUrl(page);
            if (prevUrl) {
              // Validate that URL contains root path
              const urlValidation = this.validateUrlContainsRootPath(prevUrl, book.rootPath);
              if (!urlValidation.valid) {
                const errorMsg = `Previous chapter URL does not match root path: ${urlValidation.reason}`;
                console.error(`Error: ${errorMsg}`);
                this.errors.push({ url: prevUrl, type: 'url_validation_error', message: errorMsg });
                console.log(`Stopping scrape - previous URL does not contain root path: ${urlValidation.reason}`);
                break;
              }
              
              // Update lastPathScraped before moving to previous chapter
              const currentPath = this.extractPathFromUrl(currentUrl);
              book.lastPathScraped = currentPath;
              await this.dataManager.updateBook(bookId, {
                lastPathScraped: book.lastPathScraped
              });
              
              console.log('Trying previous chapter instead...');
              currentUrl = prevUrl;
              continue;
            }
            console.log('Stopping scrape - no content and no valid previous chapter');
            break;
          }

          // Extract content using plugin
          // Don't pass calculated chapterNumber - let plugin extract from URL for accuracy
          const chapterData = await plugin.scrapeChapter(currentUrl, page, {
            scrollDelay: 1000,
            maxScrolls: 10,
            debug
          });

          // Update book title if not set and plugin provides it
          if (!book.title && chapterData.bookTitle) {
            book.title = chapterData.bookTitle;
            await this.dataManager.updateBook(bookId, { title: book.title });
            console.log(`✓ Set book title: ${book.title}`);
          }

          // Use chapter number from scraped data (should be extracted from URL by plugin)
          let currentChapterNumber = chapterData.chapterNumber;
          if (!currentChapterNumber) {
            const errorMsg = `Could not determine chapter number from URL: ${currentUrl}`;
            console.warn(`⚠ ${errorMsg}`);
            this.errors.push({ url: currentUrl, type: 'chapter_number', message: errorMsg });
            
            // Calculate fallback chapter number based on last scraped chapter
            // If last chapter was 1.1113, use 1.11129 (closest number that sorts before it)
            // For subsequent fallback chapters, use the previous fallback as base: 1.11128, 1.11127, etc.
            // This gives us a buffer of 99 fallback chapters (0.00001 to 0.00099)
            // Note: With 4-digit chapter padding, chapters are formatted as volume.XXXX (e.g., 1.1113)
            if (lastChapterNumber !== null && lastChapterNumber !== undefined) {
              // Calculate the fallback: subtract 0.00001 from the last chapter number
              // This ensures fallback chapters sort before the last known chapter
              // Each subsequent fallback will use the previous fallback as base
              // This gives us a buffer of 99 fallback chapters (0.00001 to 0.00099)
              currentChapterNumber = lastChapterNumber - 0.00001;
              
              // Format to ensure proper decimal precision (5 decimal places max)
              currentChapterNumber = Math.round(currentChapterNumber * 100000) / 100000;
              
              console.warn(`⚠ Using fallback chapter number: ${currentChapterNumber} (based on last chapter ${lastChapterNumber})`);
            } else {
              // No previous chapter to base fallback on - try to extract from URL
              const chapterMatch = currentUrl.match(/chapter[_-]?(\d+\.?\d*)/i);
              if (chapterMatch) {
                const fallbackNumber = parseFloat(chapterMatch[1]);
                console.warn(`⚠ Using fallback chapter number from URL: ${fallbackNumber}`);
                currentChapterNumber = fallbackNumber;
              } else {
                // Last resort: throw error if we can't determine chapter number and have no previous chapter
                throw new Error(`Could not determine chapter number from URL: ${currentUrl} and no previous chapter to base fallback on`);
              }
            }
          }
          
          // Update lastChapterNumber for next iteration (use the actual chapter number we're saving)
          // This ensures subsequent fallbacks are based on the most recently assigned chapter number
          lastChapterNumber = currentChapterNumber;
          
          // Format and save content
          const chapterPath = this.extractPathFromUrl(currentUrl);
          
          // Check if chapter was already scraped
          const alreadyScraped = book.hasChapter(chapterPath);
          
          // Save chapter if not already scraped, or if forceSave is enabled
          if (!alreadyScraped || forceSave) {
            // Add chapter with number to book (only if not already added)
            if (!alreadyScraped) {
              book.addChapter(chapterPath, currentChapterNumber);
            }
            
            // Get sorted chapters to find previous/next
            const sortedChapters = book.getChaptersSorted();
            const currentIndex = sortedChapters.findIndex(ch => {
              const chPath = book.getChapterPath(ch);
              return chPath === chapterPath;
            });
            
            const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
            const nextChapter = currentIndex >= 0 && currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;
            
            const prevChapterPath = prevChapter ? book.getChapterPath(prevChapter) : null;
            const nextChapterPath = nextChapter ? book.getChapterPath(nextChapter) : null;
            
            // Save current chapter with navigation
            await this.saveChapter(bookId, chapterPath, chapterData, plugin.getContentType(), prevChapterPath, nextChapterPath, currentUrl);
            
            // Update previous chapter's "next" link if it exists
            if (prevChapterPath) {
              await this.updateChapterNavigation(bookId, prevChapterPath, chapterPath);
            }
            
            // Update next chapter's "previous" link if it exists
            if (nextChapterPath) {
              await this.updateChapterNavigation(bookId, nextChapterPath, chapterPath, true);
            }

            chapterCount++;
            if (alreadyScraped && forceSave) {
              console.log(`✓ Force saved chapter (overwrote existing): ${currentChapterNumber} ${chapterData.title}`);
            } else {
              console.log(`✓ Saved chapter ${currentChapterNumber}: ${chapterData.title}`);
            }
            
            // Update TOC after saving chapter
            await this.generateTOC(bookId);
          } else {
            console.log(`⊘ Chapter already scraped, skipping: ${currentChapterNumber} ${chapterData.title}`);
            // Still update TOC to ensure it's current (in case chapters were added/updated elsewhere)
            await this.generateTOC(bookId);
          }

          // Update book metadata (always update lastPathScraped, even if chapter was already scraped)
          book.lastPathScraped = chapterPath;
          await this.dataManager.updateBook(bookId, {
            chapters: book.chapters,
            lastPathScraped: book.lastPathScraped
          });

          // Get previous chapter URL
          const prevUrl = await plugin.getPreviousChapterUrl(page);
          
          if (!prevUrl) {
            console.log('No previous chapter found, reverse scraping complete');
            break;
          }

          // Validate that URL contains root path
          const urlValidation = this.validateUrlContainsRootPath(prevUrl, book.rootPath);
          if (!urlValidation.valid) {
            const errorMsg = `Previous chapter URL does not match root path: ${urlValidation.reason}`;
            console.error(`Error: ${errorMsg}`);
            this.errors.push({ url: prevUrl, type: 'url_validation_error', message: errorMsg });
            console.log(`Stopping scrape - previous URL does not contain root path: ${urlValidation.reason}`);
            break;
          }

          // Continue to previous chapter even if it's already scraped
          currentUrl = prevUrl;

        } catch (error) {
          const errorMsg = `Error scraping ${currentUrl}: ${error.message}`;
          console.error(errorMsg);
          this.errors.push({ url: currentUrl, type: 'scraping_error', message: errorMsg });
          
          // Continue to previous chapter if possible, or break on critical errors
          const prevUrl = await plugin.getPreviousChapterUrl(page).catch(() => null);
          if (!prevUrl) {
            throw error; // Re-throw if we can't continue
          }
          
          // Validate that URL contains root path
          const urlValidation = this.validateUrlContainsRootPath(prevUrl, book.rootPath);
          if (!urlValidation.valid) {
            const errorMsg = `Previous chapter URL does not match root path: ${urlValidation.reason}`;
            console.error(`Error: ${errorMsg}`);
            this.errors.push({ url: prevUrl, type: 'url_validation_error', message: errorMsg });
            console.log(`Stopping scrape - previous URL does not contain root path: ${urlValidation.reason}`);
            throw error; // Re-throw the original error
          }
          
          currentUrl = prevUrl;
        }
      }

      console.log(`\nReverse scraping complete. Scraped ${chapterCount} chapter(s).`);
      
      // Report accumulated errors
      this.reportErrors();

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

  validateUrlContainsRootPath(url, rootPath) {
    // Extract path from URL
    const urlPath = this.extractPathFromUrl(url);
    
    // Normalize rootPath - if it's a full URL, extract just the pathname
    let normalizedRootPath = rootPath;
    try {
      // Check if rootPath looks like a URL (starts with http:// or https://)
      if (rootPath.startsWith('http://') || rootPath.startsWith('https://')) {
        const rootPathUrl = new URL(rootPath);
        normalizedRootPath = rootPathUrl.pathname;
        // Remove trailing slash for comparison
        normalizedRootPath = normalizedRootPath.replace(/\/$/, '');
      }
    } catch {
      // If parsing fails, use rootPath as-is
      normalizedRootPath = rootPath;
    }
    
    // Normalize urlPath - remove trailing slash for comparison
    const normalizedUrlPath = urlPath.replace(/\/$/, '');
    
    // Check if URL path contains the root path
    // This ensures the URL is still part of the same book
    if (!normalizedUrlPath.includes(normalizedRootPath)) {
      return {
        valid: false,
        reason: `URL path does not contain root path "${rootPath}" (normalized: "${normalizedRootPath}")`
      };
    }
    
    return { valid: true };
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

  sanitizePathForFilename(chapterPath) {
    // Sanitize chapter path for filename (used for both chapter files and TOC links)
    return chapterPath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'index';
  }

  async saveChapter(bookId, chapterPath, chapterData, contentType, prevChapterPath = null, nextChapterPath = null, url = null) {
    const bookContentDir = path.join(CONTENT_DIR, bookId);
    await fs.ensureDir(bookContentDir);

    // Sanitize chapter path for filename
    const sanitizedPath = this.sanitizePathForFilename(chapterPath);

    const filename = `${sanitizedPath}.md`;
    const filePath = path.join(bookContentDir, filename);

    // Generate navigation links
    const navigation = this.generateNavigation(prevChapterPath, nextChapterPath);

    // Format title: chapter number followed by chapter title
    let titleLine = chapterData.title;
    if (chapterData.chapterNumber !== undefined && chapterData.chapterNumber !== null) {
      titleLine = `${chapterData.chapterNumber} ${chapterData.title}`;
    }

    // Format markdown content
    let markdown = `# ${titleLine}\n\n`;
    
    // Add navigation at the top
    if (navigation) {
      markdown += `${navigation}\n\n`;
    }
    
    if (contentType === 'image' && chapterData.images && chapterData.images.length > 0) {
      // For image content, download images and save in chapter subfolder
      const chapterImageDir = path.join(bookContentDir, sanitizedPath);
      await fs.ensureDir(chapterImageDir);
      
      const localImagePaths = [];
      
      for (let i = 0; i < chapterData.images.length; i++) {
        const imageUrl = chapterData.images[i];
        try {
          // Determine file extension from URL or default to .jpg
          const urlPath = new URL(imageUrl).pathname;
          const extMatch = urlPath.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i);
          const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
          
          // Generate filename: image_001.jpg, image_002.jpg, etc.
          const imageFilename = `image_${String(i + 1).padStart(3, '0')}.${ext}`;
          const imagePath = path.join(chapterImageDir, imageFilename);
          
          // Download image
          console.log(`  Downloading image ${i + 1}/${chapterData.images.length}...`);
          const response = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          await fs.writeFile(imagePath, buffer);
          
          // Store relative path from markdown file to image
          const relativeImagePath = path.join(sanitizedPath, imageFilename).replace(/\\/g, '/');
          localImagePaths.push(relativeImagePath);
        } catch (error) {
          console.error(`  Failed to download image ${i + 1} (${imageUrl}): ${error.message}`);
          // Fallback to original URL if download fails
          localImagePaths.push(imageUrl);
        }
      }
      
      // Add images with local paths
      for (const imagePath of localImagePaths) {
        markdown += `![Image](${imagePath})\n\n`;
      }
    } else {
      // Add text content
      markdown += chapterData.content;
    }

    // Add navigation at the bottom as well
    if (navigation) {
      markdown += `\n\n---\n\n${navigation}`;
    }

    // Add URL at the very end
    if (url) {
      markdown += `\n\n${url}`;
    }

    await fs.writeFile(filePath, markdown, 'utf8');
  }

  generateNavigation(prevChapterPath, nextChapterPath) {
    const navParts = [];

    // Previous chapter
    if (prevChapterPath) {
      const prevSanitized = this.sanitizePathForFilename(prevChapterPath);
      navParts.push(`[← Previous Chapter](${prevSanitized}.md)`);
    } else {
      navParts.push('← Previous Chapter');
    }

    // Separator
    navParts.push(' | ');

    // Next chapter
    if (nextChapterPath) {
      const nextSanitized = this.sanitizePathForFilename(nextChapterPath);
      navParts.push(`[Next Chapter →](${nextSanitized}.md)`);
    } else {
      navParts.push('Next Chapter →');
    }

    return navParts.join('');
  }

  async generateTOC(bookId) {
    // Load book data
    const book = await this.dataManager.getBook(bookId);
    if (!book) {
      throw new Error(`Book with id ${bookId} not found`);
    }

    const bookContentDir = path.join(CONTENT_DIR, bookId);
    
    // Get sorted chapters
    const sortedChapters = book.getChaptersSorted();
    
    if (sortedChapters.length === 0) {
      console.log('No chapters found. TOC.md will not be created.');
      return;
    }

    // Read chapter titles from files and group by volume
    const volumeMap = new Map(); // Map<volume, Array<{number, title, filename}>>
    
    for (const chapter of sortedChapters) {
      const chapterPath = book.getChapterPath(chapter);
      const chapterNumber = book.getChapterNumber(chapter);
      const sanitizedPath = this.sanitizePathForFilename(chapterPath);
      const filePath = path.join(bookContentDir, `${sanitizedPath}.md`);

      let title = 'Untitled';
      if (await fs.pathExists(filePath)) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          // Extract title from markdown (first line should be # Title)
          const titleMatch = content.match(/^#\s+(.+)$/m);
          if (titleMatch) {
            title = titleMatch[1].trim();
            // Remove chapter number prefix if present (format: "2.027 Title" -> "Title")
            title = title.replace(/^\d+\.?\d*\s+/, '');
          }
        } catch (error) {
          console.warn(`Warning: Could not read chapter file ${filePath}: ${error.message}`);
        }
      }

      // Extract volume from chapter number (e.g., 2.0027 -> volume 2)
      let volume = 1; // Default to volume 1
      if (chapterNumber !== null) {
        const volumeMatch = chapterNumber.toString().match(/^(\d+)\./);
        if (volumeMatch) {
          volume = parseInt(volumeMatch[1], 10);
        }
      }
      
      // Format chapter number for display (ensure 4-digit padding)
      // When parseFloat is used, trailing zeros are lost (e.g., 1.0010 becomes 1.001)
      // We need to reconstruct the proper 4-digit format
      let formattedChapterNumber = null;
      if (chapterNumber !== null) {
        const chapterNumStr = chapterNumber.toString();
        if (chapterNumStr.includes('.')) {
          const parts = chapterNumStr.split('.');
          if (parts.length >= 2) {
            const integerPart = parts[0];
            let decimalPart = parts[1];
            // Right-pad decimal part to 4 digits to restore trailing zeros
            decimalPart = decimalPart.padEnd(4, '0');
            formattedChapterNumber = parseFloat(`${integerPart}.${decimalPart}`);
          }
        }
        if (formattedChapterNumber === null) {
          formattedChapterNumber = chapterNumber;
        }
      }

      if (!volumeMap.has(volume)) {
        volumeMap.set(volume, []);
      }

      volumeMap.get(volume).push({
        number: formattedChapterNumber !== null ? formattedChapterNumber : chapterNumber,
        title: title,
        filename: `${sanitizedPath}.md`
      });
    }

    // Generate TOC markdown
    let tocContent = `# Table of Contents\n\n`;
    if (book.title) {
      tocContent += `**${book.title}**\n\n`;
    }
    tocContent += `---\n\n`;

    // Sort volumes and generate sections
    const sortedVolumes = Array.from(volumeMap.keys()).sort((a, b) => a - b);
    
    for (const volume of sortedVolumes) {
      const chapters = volumeMap.get(volume);
      tocContent += `## 📖 Volume ${volume}\n\n`;
      
      for (const entry of chapters) {
        // Format chapter number: if it's a decimal like 2.0027, show just the chapter part (0027)
        // With 4-digit padding, chapters are formatted as volume.XXXX (e.g., 2.0027 for chapter 27)
        // Note: parseFloat removes trailing zeros, so we need to ensure 4-digit display
        let numberStr = '';
        if (entry.number !== null) {
          const chapterNumStr = entry.number.toString();
          if (chapterNumStr.includes('.')) {
            // Extract chapter part after the decimal point
            const parts = chapterNumStr.split('.');
            if (parts.length >= 2) {
              // Right-pad to 4 digits to restore trailing zeros lost by parseFloat
              // e.g., "001" -> "0010", "002" -> "0020", "0027" -> "0027"
              let decimalPart = parts[1].padEnd(4, '0');
              numberStr = `${decimalPart} `;
            } else {
              numberStr = `${entry.number} `;
            }
          } else {
            numberStr = `${entry.number} `;
          }
        }
        tocContent += `- [${numberStr}${entry.title}](${entry.filename})\n`;
      }
      
      tocContent += `\n`;
    }

    // Write TOC.md
    const tocPath = path.join(bookContentDir, 'TOC.md');
    await fs.writeFile(tocPath, tocContent, 'utf8');
    console.log(`✓ Updated TOC.md (${sortedChapters.length} chapters in ${sortedVolumes.length} volume(s))`);
  }

  reportErrors() {
    if (this.errors.length === 0) {
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Scraping Errors Summary (${this.errors.length} error(s)):`);
    console.log('='.repeat(60));
    
    // Group errors by type
    const errorsByType = {};
    for (const error of this.errors) {
      if (!errorsByType[error.type]) {
        errorsByType[error.type] = [];
      }
      errorsByType[error.type].push(error);
    }
    
    // Report errors grouped by type
    for (const [type, errors] of Object.entries(errorsByType)) {
      console.log(`\n${type.toUpperCase().replace(/_/g, ' ')} (${errors.length}):`);
      for (const error of errors) {
        console.log(`  - ${error.url}`);
        console.log(`    ${error.message}`);
      }
    }
    
    console.log(`\n${'='.repeat(60)}\n`);
  }

  async updateChapterNavigation(bookId, chapterPath, linkedChapterPath, isPreviousLink = false) {
    const bookContentDir = path.join(CONTENT_DIR, bookId);
    
    // Sanitize paths for filenames
    const sanitizedPath = this.sanitizePathForFilename(chapterPath);
    const linkedSanitized = this.sanitizePathForFilename(linkedChapterPath);

    const filename = `${sanitizedPath}.md`;
    const filePath = path.join(bookContentDir, filename);

    // Check if file exists
    if (!(await fs.pathExists(filePath))) {
      return; // File doesn't exist, skip update
    }

    // Read the file
    let content = await fs.readFile(filePath, 'utf8');

    if (isPreviousLink) {
      // Update "← Previous Chapter" plain text to link
      const linkPrev = `[← Previous Chapter](${linkedSanitized}.md)`;
      // Match pattern: "← Previous Chapter | " (plain text) followed by next part
      const navPattern = /← Previous Chapter( \| (?:\[Next Chapter →\]\([^)]+\)|Next Chapter →))/g;
      content = content.replace(navPattern, `${linkPrev}$1`);
    } else {
      // Update "Next Chapter →" plain text to link
      const linkNext = `[Next Chapter →](${linkedSanitized}.md)`;
      // Match pattern: anything before " | Next Chapter →" (plain text)
      const navPattern = /((?:\[← Previous Chapter\]\([^)]+\)|← Previous Chapter) \| )Next Chapter →/g;
      content = content.replace(navPattern, `$1${linkNext}`);
    }

    // Write the updated content back
    await fs.writeFile(filePath, content, 'utf8');
  }
}




```

Checking for linting errors and verifying the implementation:


No linting errors. Refining the plugin to better match manhuaus.org's structure based on the sample page:


Refining the plugin to better handle manhuaus.org's navigation structure:


```javascript
/**
 * Plugin for manhuaus.org
 * 
 * This plugin scrapes manga chapter content from manhuaus.org.
 * Chapters contain images that need to be downloaded and saved in chapter subfolders.
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    const nextLink = await page.evaluate(() => {
      // Look for "Next" button or link
      // Common patterns: "Next", "Next Chapter", links with "Next" text
      const allLinks = document.querySelectorAll('a');
      const currentUrl = window.location.href;
      
      for (const link of allLinks) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "next" (look for exact matches first)
        if ((text === 'next' || text === 'next chapter' || text.includes('next chapter')) && 
            href && 
            href !== currentUrl && 
            href !== currentUrl.split('#')[0] &&
            !href.includes('javascript:') &&
            !href.includes('#') &&
            href.includes('/chapter-')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns common in manga sites
      const nextById = document.getElementById('next');
      if (nextById && nextById.href && nextById.href !== currentUrl && nextById.href.includes('/chapter-')) {
        return nextById.href;
      }
      
      // Try finding by title attribute
      const nextByTitle = document.querySelector('a[title*="Next"], a[title*="next"]');
      if (nextByTitle && nextByTitle.href && nextByTitle.href !== currentUrl && nextByTitle.href.includes('/chapter-')) {
        return nextByTitle.href;
      }
      
      // Fallback: Extract current chapter number and find next chapter link
      const currentMatch = currentUrl.match(/chapter-(\d+)/i);
      if (currentMatch) {
        const currentChapter = parseInt(currentMatch[1], 10);
        const nextChapter = currentChapter + 1;
        
        // Look for link to next chapter number
        for (const link of allLinks) {
          const href = link.href;
          if (href && href.includes(`chapter-${nextChapter}`) && href !== currentUrl) {
            return href;
          }
        }
      }
      
      return null;
    });

    return nextLink || null;
  } catch (error) {
    console.error('Error getting next chapter URL:', error);
    return null;
  }
}

/**
 * Extracts the "previous chapter" URL from the current page.
 */
export async function getPreviousChapterUrl(page) {
  try {
    const prevLink = await page.evaluate(() => {
      // Look for "Previous" or "Prev" button or link
      const prevButtons = document.querySelectorAll('a');
      
      for (const link of prevButtons) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "previous"
        if ((text === 'prev' || text === 'previous' || text.includes('previous chapter')) && 
            href && 
            href !== window.location.href && 
            !href.includes('javascript:') &&
            !href.includes('#')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns
      const prevById = document.getElementById('prev');
      if (prevById && prevById.href) {
        return prevById.href;
      }
      
      // Try finding by title attribute
      const prevByTitle = document.querySelector('a[title*="Prev"], a[title*="prev"], a[title*="Previous"], a[title*="previous"]');
      if (prevByTitle && prevByTitle.href && prevByTitle.href !== window.location.href) {
        return prevByTitle.href;
      }
      
      return null;
    });

    return prevLink || null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content (images).
 */
export async function hasContent(page, options = {}) {
  const debug = options.debug || false;
  try {
    const hasImages = await page.evaluate(() => {
      // Look for manga images - typically in containers like .reading-content, .chapter-content, etc.
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article img',
        '.content img',
        'main img'
      ];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        // Filter out logos, ads, and navigation images
        const validImages = Array.from(images).filter(img => {
          const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
          if (!src) return false;
          
          // Exclude common non-content images
          const lowerSrc = src.toLowerCase();
          return !lowerSrc.includes('logo') && 
                 !lowerSrc.includes('banner') && 
                 !lowerSrc.includes('ad') &&
                 !lowerSrc.includes('avatar') &&
                 !lowerSrc.includes('icon');
        });
        
        if (validImages.length > 0) {
          return true;
        }
      }
      
      return false;
    });
    
    if (debug) {
      console.log('[DEBUG hasContent] Has images:', hasImages);
    }
    
    return hasImages;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrolls the page to load lazy-loaded content.
 */
async function scrollPage(page, scrollDelay = 400, maxScrolls = 10) {
  let lastHeight = 0;
  let scrollCount = 0;
  
  while (scrollCount < maxScrolls) {
    // Get current scroll position and page height
    const { currentHeight, totalHeight } = await page.evaluate(() => {
      return {
        currentHeight: window.innerHeight + window.scrollY,
        totalHeight: document.body.scrollHeight
      };
    });
    
    // Scroll down
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    
    await page.waitForTimeout(scrollDelay);
    
    // Check if we've reached the bottom
    const newHeight = await page.evaluate(() => window.innerHeight + window.scrollY);
    if (newHeight === lastHeight && newHeight >= totalHeight - 100) {
      break; // Reached bottom
    }
    
    lastHeight = newHeight;
    scrollCount++;
  }
  
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(scrollDelay);
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  const debug = options.debug || false;
  try {
    if (debug) console.log('[DEBUG scrapeChapter] Starting scrape for:', url);
    
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      if (debug) console.log('[DEBUG scrapeChapter] Page loaded');
    }
    
    // Wait a bit for page to fully load
    await page.waitForTimeout(2000);
    
    // Scroll to load lazy-loaded images
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);
    if (debug) console.log('[DEBUG scrapeChapter] Finished scrolling');
    
    // Extract title and chapter number
    const { title, chapterNumber } = await page.evaluate(() => {
      let titleText = null;
      let chapterNum = null;
      
      // Try multiple title selectors
      const titleSelectors = [
        'h1',
        '.chapter-title',
        '.entry-title',
        'title'
      ];
      
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          titleText = el.textContent.trim();
          break;
        }
      }
      
      // If no title found, try to extract from page title
      if (!titleText) {
        titleText = document.title;
      }
      
      // Extract chapter number from title or URL
      const chapterMatch = titleText.match(/Chapter\s+(\d+)/i) || 
                          window.location.pathname.match(/chapter-(\d+)/i);
      if (chapterMatch) {
        chapterNum = parseFloat(chapterMatch[1]);
      }
      
      // Clean up title - remove site name and other metadata
      if (titleText) {
        titleText = titleText
          .replace(/\s*[-–—]\s*Manhuaus[^]*$/i, '')
          .replace(/\s*[-–—]\s*Manhua[^]*$/i, '')
          .trim();
      }
      
      return {
        title: titleText || 'Untitled Chapter',
        chapterNumber: chapterNum
      };
    });
    
    // Extract images - look for manga page images
    const imageUrls = await page.evaluate(() => {
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article .wp-block-image img',
        'article img',
        '.content img',
        'main img'
      ];
      
      const allImages = [];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        if (images.length > 0) {
          Array.from(images).forEach(img => {
            const src = img.src || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-lazy-src') ||
                       img.getAttribute('data-original');
            
            if (src) {
              // Convert relative URLs to absolute
              const absoluteSrc = src.startsWith('http') ? src : new URL(src, window.location.href).href;
              
              // Filter out non-content images
              const lowerSrc = absoluteSrc.toLowerCase();
              if (!lowerSrc.includes('logo') && 
                  !lowerSrc.includes('banner') && 
                  !lowerSrc.includes('ad') &&
                  !lowerSrc.includes('avatar') &&
                  !lowerSrc.includes('icon') &&
                  !lowerSrc.includes('placeholder')) {
                allImages.push(absoluteSrc);
              }
            }
          });
          
          // If we found images with this selector, use them (likely the correct one)
          if (allImages.length > 0) {
            break;
          }
        }
      }
      
      // Remove duplicates while preserving order
      return Array.from(new Set(allImages));
    });
    
    if (debug) {
      console.log(`[DEBUG scrapeChapter] Extracted ${imageUrls.length} images`);
    }
    
    if (imageUrls.length === 0) {
      throw new Error('No images found on page');
    }
    
    return {
      title,
      content: '', // No text content for manga
      chapterNumber,
      images: imageUrls
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type this plugin handles.
 */
export function getContentType() {
  return 'image';
}

/**
 * Returns whether this site uses Cloudflare protection.
 */
export function isCloudflarePage() {
  return false; // Update if site uses Cloudflare
}

```

```javascript
/**
 * Plugin for manhuaus.org
 * 
 * This plugin scrapes manga chapter content from manhuaus.org.
 * Chapters contain images that need to be downloaded and saved in chapter subfolders.
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    const nextLink = await page.evaluate(() => {
      // Look for "Next" button or link
      // Common patterns: "Next", "Next Chapter", links with "Next" text
      const allLinks = document.querySelectorAll('a');
      const currentUrl = window.location.href;
      
      for (const link of allLinks) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "next" (look for exact matches first)
        if ((text === 'next' || text === 'next chapter' || text.includes('next chapter')) && 
            href && 
            href !== currentUrl && 
            href !== currentUrl.split('#')[0] &&
            !href.includes('javascript:') &&
            !href.includes('#') &&
            href.includes('/chapter-')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns common in manga sites
      const nextById = document.getElementById('next');
      if (nextById && nextById.href && nextById.href !== currentUrl && nextById.href.includes('/chapter-')) {
        return nextById.href;
      }
      
      // Try finding by title attribute
      const nextByTitle = document.querySelector('a[title*="Next"], a[title*="next"]');
      if (nextByTitle && nextByTitle.href && nextByTitle.href !== currentUrl && nextByTitle.href.includes('/chapter-')) {
        return nextByTitle.href;
      }
      
      // Fallback: Extract current chapter number and find next chapter link
      const currentMatch = currentUrl.match(/chapter-(\d+)/i);
      if (currentMatch) {
        const currentChapter = parseInt(currentMatch[1], 10);
        const nextChapter = currentChapter + 1;
        
        // Look for link to next chapter number
        for (const link of allLinks) {
          const href = link.href;
          if (href && href.includes(`chapter-${nextChapter}`) && href !== currentUrl) {
            return href;
          }
        }
      }
      
      return null;
    });

    return nextLink || null;
  } catch (error) {
    console.error('Error getting next chapter URL:', error);
    return null;
  }
}

/**
 * Extracts the "previous chapter" URL from the current page.
 */
export async function getPreviousChapterUrl(page) {
  try {
    const prevLink = await page.evaluate(() => {
      // Look for "Previous" or "Prev" button or link
      const allLinks = document.querySelectorAll('a');
      const currentUrl = window.location.href;
      
      for (const link of allLinks) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "previous"
        if ((text === 'prev' || text === 'previous' || text === 'previous chapter' || text.includes('previous chapter')) && 
            href && 
            href !== currentUrl && 
            href !== currentUrl.split('#')[0] &&
            !href.includes('javascript:') &&
            !href.includes('#') &&
            href.includes('/chapter-')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns
      const prevById = document.getElementById('prev');
      if (prevById && prevById.href && prevById.href !== currentUrl && prevById.href.includes('/chapter-')) {
        return prevById.href;
      }
      
      // Try finding by title attribute
      const prevByTitle = document.querySelector('a[title*="Prev"], a[title*="prev"], a[title*="Previous"], a[title*="previous"]');
      if (prevByTitle && prevByTitle.href && prevByTitle.href !== currentUrl && prevByTitle.href.includes('/chapter-')) {
        return prevByTitle.href;
      }
      
      // Fallback: Extract current chapter number and find previous chapter link
      const currentMatch = currentUrl.match(/chapter-(\d+)/i);
      if (currentMatch) {
        const currentChapter = parseInt(currentMatch[1], 10);
        const prevChapter = currentChapter - 1;
        
        if (prevChapter > 0) {
          // Look for link to previous chapter number
          for (const link of allLinks) {
            const href = link.href;
            if (href && href.includes(`chapter-${prevChapter}`) && href !== currentUrl) {
              return href;
            }
          }
        }
      }
      
      return null;
    });

    return prevLink || null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content (images).
 */
export async function hasContent(page, options = {}) {
  const debug = options.debug || false;
  try {
    const hasImages = await page.evaluate(() => {
      // Look for manga images - typically in containers like .reading-content, .chapter-content, etc.
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article img',
        '.content img',
        'main img'
      ];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        // Filter out logos, ads, and navigation images
        const validImages = Array.from(images).filter(img => {
          const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
          if (!src) return false;
          
          // Exclude common non-content images
          const lowerSrc = src.toLowerCase();
          return !lowerSrc.includes('logo') && 
                 !lowerSrc.includes('banner') && 
                 !lowerSrc.includes('ad') &&
                 !lowerSrc.includes('avatar') &&
                 !lowerSrc.includes('icon');
        });
        
        if (validImages.length > 0) {
          return true;
        }
      }
      
      return false;
    });
    
    if (debug) {
      console.log('[DEBUG hasContent] Has images:', hasImages);
    }
    
    return hasImages;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrolls the page to load lazy-loaded content.
 */
async function scrollPage(page, scrollDelay = 400, maxScrolls = 10) {
  let lastHeight = 0;
  let scrollCount = 0;
  
  while (scrollCount < maxScrolls) {
    // Get current scroll position and page height
    const { currentHeight, totalHeight } = await page.evaluate(() => {
      return {
        currentHeight: window.innerHeight + window.scrollY,
        totalHeight: document.body.scrollHeight
      };
    });
    
    // Scroll down
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    
    await page.waitForTimeout(scrollDelay);
    
    // Check if we've reached the bottom
    const newHeight = await page.evaluate(() => window.innerHeight + window.scrollY);
    if (newHeight === lastHeight && newHeight >= totalHeight - 100) {
      break; // Reached bottom
    }
    
    lastHeight = newHeight;
    scrollCount++;
  }
  
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(scrollDelay);
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  const debug = options.debug || false;
  try {
    if (debug) console.log('[DEBUG scrapeChapter] Starting scrape for:', url);
    
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      if (debug) console.log('[DEBUG scrapeChapter] Page loaded');
    }
    
    // Wait a bit for page to fully load
    await page.waitForTimeout(2000);
    
    // Scroll to load lazy-loaded images
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);
    if (debug) console.log('[DEBUG scrapeChapter] Finished scrolling');
    
    // Extract title and chapter number
    const { title, chapterNumber } = await page.evaluate(() => {
      let titleText = null;
      let chapterNum = null;
      
      // Try multiple title selectors
      const titleSelectors = [
        'h1',
        '.chapter-title',
        '.entry-title',
        'title'
      ];
      
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          titleText = el.textContent.trim();
          break;
        }
      }
      
      // If no title found, try to extract from page title
      if (!titleText) {
        titleText = document.title;
      }
      
      // Extract chapter number from title or URL
      const chapterMatch = titleText.match(/Chapter\s+(\d+)/i) || 
                          window.location.pathname.match(/chapter-(\d+)/i);
      if (chapterMatch) {
        chapterNum = parseFloat(chapterMatch[1]);
      }
      
      // Clean up title - remove site name and other metadata
      if (titleText) {
        titleText = titleText
          .replace(/\s*[-–—]\s*Manhuaus[^]*$/i, '')
          .replace(/\s*[-–—]\s*Manhua[^]*$/i, '')
          .trim();
      }
      
      return {
        title: titleText || 'Untitled Chapter',
        chapterNumber: chapterNum
      };
    });
    
    // Extract images - look for manga page images
    const imageUrls = await page.evaluate(() => {
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article .wp-block-image img',
        'article img',
        '.content img',
        'main img'
      ];
      
      const allImages = [];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        if (images.length > 0) {
          Array.from(images).forEach(img => {
            const src = img.src || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-lazy-src') ||
                       img.getAttribute('data-original');
            
            if (src) {
              // Convert relative URLs to absolute
              const absoluteSrc = src.startsWith('http') ? src : new URL(src, window.location.href).href;
              
              // Filter out non-content images
              const lowerSrc = absoluteSrc.toLowerCase();
              if (!lowerSrc.includes('logo') && 
                  !lowerSrc.includes('banner') && 
                  !lowerSrc.includes('ad') &&
                  !lowerSrc.includes('avatar') &&
                  !lowerSrc.includes('icon') &&
                  !lowerSrc.includes('placeholder')) {
                allImages.push(absoluteSrc);
              }
            }
          });
          
          // If we found images with this selector, use them (likely the correct one)
          if (allImages.length > 0) {
            break;
          }
        }
      }
      
      // Remove duplicates while preserving order
      return Array.from(new Set(allImages));
    });
    
    if (debug) {
      console.log(`[DEBUG scrapeChapter] Extracted ${imageUrls.length} images`);
    }
    
    if (imageUrls.length === 0) {
      throw new Error('No images found on page');
    }
    
    return {
      title,
      content: '', // No text content for manga
      chapterNumber,
      images: imageUrls
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type this plugin handles.
 */
export function getContentType() {
  return 'image';
}

/**
 * Returns whether this site uses Cloudflare protection.
 */
export function isCloudflarePage() {
  return false; // Update if site uses Cloudflare
}

```

```javascript
/**
 * Plugin for manhuaus.org
 * 
 * This plugin scrapes manga chapter content from manhuaus.org.
 * Chapters contain images that need to be downloaded and saved in chapter subfolders.
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    const nextLink = await page.evaluate(() => {
      // Look for "Next" button or link
      // Common patterns: "Next", "Next Chapter", links with "Next" text
      const allLinks = document.querySelectorAll('a');
      const currentUrl = window.location.href;
      
      for (const link of allLinks) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "next" (look for exact matches first)
        if ((text === 'next' || text === 'next chapter' || text.includes('next chapter')) && 
            href && 
            href !== currentUrl && 
            href !== currentUrl.split('#')[0] &&
            !href.includes('javascript:') &&
            !href.includes('#') &&
            href.includes('/chapter-')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns common in manga sites
      const nextById = document.getElementById('next');
      if (nextById && nextById.href && nextById.href !== currentUrl && nextById.href.includes('/chapter-')) {
        return nextById.href;
      }
      
      // Try finding by title attribute
      const nextByTitle = document.querySelector('a[title*="Next"], a[title*="next"]');
      if (nextByTitle && nextByTitle.href && nextByTitle.href !== currentUrl && nextByTitle.href.includes('/chapter-')) {
        return nextByTitle.href;
      }
      
      // Fallback: Extract current chapter number and find next chapter link
      const currentMatch = currentUrl.match(/chapter-(\d+)/i);
      if (currentMatch) {
        const currentChapter = parseInt(currentMatch[1], 10);
        const nextChapter = currentChapter + 1;
        
        // Look for link to next chapter number
        for (const link of allLinks) {
          const href = link.href;
          if (href && href.includes(`chapter-${nextChapter}`) && href !== currentUrl) {
            return href;
          }
        }
      }
      
      return null;
    });

    return nextLink || null;
  } catch (error) {
    console.error('Error getting next chapter URL:', error);
    return null;
  }
}

/**
 * Extracts the "previous chapter" URL from the current page.
 */
export async function getPreviousChapterUrl(page) {
  try {
    const prevLink = await page.evaluate(() => {
      // Look for "Previous" or "Prev" button or link
      const allLinks = document.querySelectorAll('a');
      const currentUrl = window.location.href;
      
      for (const link of allLinks) {
        const text = link.textContent.trim().toLowerCase();
        const href = link.href;
        
        // Check if link text indicates "previous"
        if ((text === 'prev' || text === 'previous' || text === 'previous chapter' || text.includes('previous chapter')) && 
            href && 
            href !== currentUrl && 
            href !== currentUrl.split('#')[0] &&
            !href.includes('javascript:') &&
            !href.includes('#') &&
            href.includes('/chapter-')) {
          return href;
        }
      }
      
      // Try finding by class/id patterns
      const prevById = document.getElementById('prev');
      if (prevById && prevById.href && prevById.href !== currentUrl && prevById.href.includes('/chapter-')) {
        return prevById.href;
      }
      
      // Try finding by title attribute
      const prevByTitle = document.querySelector('a[title*="Prev"], a[title*="prev"], a[title*="Previous"], a[title*="previous"]');
      if (prevByTitle && prevByTitle.href && prevByTitle.href !== currentUrl && prevByTitle.href.includes('/chapter-')) {
        return prevByTitle.href;
      }
      
      // Fallback: Extract current chapter number and find previous chapter link
      const currentMatch = currentUrl.match(/chapter-(\d+)/i);
      if (currentMatch) {
        const currentChapter = parseInt(currentMatch[1], 10);
        const prevChapter = currentChapter - 1;
        
        if (prevChapter > 0) {
          // Look for link to previous chapter number
          for (const link of allLinks) {
            const href = link.href;
            if (href && href.includes(`chapter-${prevChapter}`) && href !== currentUrl) {
              return href;
            }
          }
        }
      }
      
      return null;
    });

    return prevLink || null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content (images).
 */
export async function hasContent(page, options = {}) {
  const debug = options.debug || false;
  try {
    const hasImages = await page.evaluate(() => {
      // Look for manga images - typically in containers like .reading-content, .chapter-content, etc.
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article img',
        '.content img',
        'main img'
      ];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        // Filter out logos, ads, and navigation images
        const validImages = Array.from(images).filter(img => {
          const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
          if (!src) return false;
          
          // Exclude common non-content images
          const lowerSrc = src.toLowerCase();
          return !lowerSrc.includes('logo') && 
                 !lowerSrc.includes('banner') && 
                 !lowerSrc.includes('ad') &&
                 !lowerSrc.includes('avatar') &&
                 !lowerSrc.includes('icon');
        });
        
        if (validImages.length > 0) {
          return true;
        }
      }
      
      return false;
    });
    
    if (debug) {
      console.log('[DEBUG hasContent] Has images:', hasImages);
    }
    
    return hasImages;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrolls the page to load lazy-loaded content.
 */
async function scrollPage(page, scrollDelay = 400, maxScrolls = 10) {
  let lastHeight = 0;
  let scrollCount = 0;
  
  while (scrollCount < maxScrolls) {
    // Get current scroll position and page height
    const { currentHeight, totalHeight } = await page.evaluate(() => {
      return {
        currentHeight: window.innerHeight + window.scrollY,
        totalHeight: document.body.scrollHeight
      };
    });
    
    // Scroll down
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    
    await page.waitForTimeout(scrollDelay);
    
    // Check if we've reached the bottom
    const newHeight = await page.evaluate(() => window.innerHeight + window.scrollY);
    if (newHeight === lastHeight && newHeight >= totalHeight - 100) {
      break; // Reached bottom
    }
    
    lastHeight = newHeight;
    scrollCount++;
  }
  
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(scrollDelay);
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  const debug = options.debug || false;
  try {
    if (debug) console.log('[DEBUG scrapeChapter] Starting scrape for:', url);
    
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      if (debug) console.log('[DEBUG scrapeChapter] Page loaded');
    }
    
    // Wait a bit for page to fully load
    await page.waitForTimeout(2000);
    
    // Scroll to load lazy-loaded images
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);
    if (debug) console.log('[DEBUG scrapeChapter] Finished scrolling');
    
    // Extract title and chapter number
    const { title, chapterNumber } = await page.evaluate(() => {
      let titleText = null;
      let chapterNum = null;
      
      // Try multiple title selectors
      const titleSelectors = [
        'h1',
        '.chapter-title',
        '.entry-title',
        'title'
      ];
      
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          titleText = el.textContent.trim();
          break;
        }
      }
      
      // If no title found, try to extract from page title
      if (!titleText) {
        titleText = document.title;
      }
      
      // Extract chapter number from URL (most reliable)
      const urlMatch = window.location.pathname.match(/chapter-(\d+)/i);
      if (urlMatch) {
        chapterNum = parseFloat(urlMatch[1]);
      } else {
        // Fallback: try to extract from title
        const titleMatch = titleText.match(/Chapter\s+(\d+)/i);
        if (titleMatch) {
          chapterNum = parseFloat(titleMatch[1]);
        }
      }
      
      // Clean up title - remove site name and other metadata
      if (titleText) {
        titleText = titleText
          .replace(/\s*[-–—]\s*Manhuaus[^]*$/i, '')
          .replace(/\s*[-–—]\s*Manhua[^]*$/i, '')
          .trim();
      }
      
      return {
        title: titleText || 'Untitled Chapter',
        chapterNumber: chapterNum
      };
    });
    
    // Extract images - look for manga page images
    const imageUrls = await page.evaluate(() => {
      const imageSelectors = [
        '.reading-content img',
        '.chapter-content img',
        '.manga-chapter img',
        '.chapter-images img',
        'article .wp-block-image img',
        'article img',
        '.content img',
        'main img'
      ];
      
      const allImages = [];
      
      for (const selector of imageSelectors) {
        const images = document.querySelectorAll(selector);
        if (images.length > 0) {
          Array.from(images).forEach(img => {
            const src = img.src || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-lazy-src') ||
                       img.getAttribute('data-original');
            
            if (src) {
              // Convert relative URLs to absolute
              const absoluteSrc = src.startsWith('http') ? src : new URL(src, window.location.href).href;
              
              // Filter out non-content images
              const lowerSrc = absoluteSrc.toLowerCase();
              if (!lowerSrc.includes('logo') && 
                  !lowerSrc.includes('banner') && 
                  !lowerSrc.includes('ad') &&
                  !lowerSrc.includes('avatar') &&
                  !lowerSrc.includes('icon') &&
                  !lowerSrc.includes('placeholder')) {
                allImages.push(absoluteSrc);
              }
            }
          });
          
          // If we found images with this selector, use them (likely the correct one)
          if (allImages.length > 0) {
            break;
          }
        }
      }
      
      // Remove duplicates while preserving order
      return Array.from(new Set(allImages));
    });
    
    if (debug) {
      console.log(`[DEBUG scrapeChapter] Extracted ${imageUrls.length} images`);
    }
    
    if (imageUrls.length === 0) {
      throw new Error('No images found on page');
    }
    
    return {
      title,
      content: '', // No text content for manga
      chapterNumber,
      images: imageUrls
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type this plugin handles.
 */
export function getContentType() {
  return 'image';
}

/**
 * Returns whether this site uses Cloudflare protection.
 */
export function isCloudflarePage() {
  return false; // Update if site uses Cloudflare
}

```

Checking for linting errors and verifying the implementation:


Implementation complete. Summary:

## Summary

Added a plugin for manhuaus.org that handles image-based manga chapters.

### 1. Created the plugin (`src/plugins/manhuaus.org.js`)
   - `getNextChapterUrl()` and `getPreviousChapterUrl()`: extract navigation links
   - `hasContent()`: checks for manga images
   - `scrapeChapter()`: extracts image URLs from the chapter page
   - `getContentType()`: returns `'image'` to indicate image-based content
   - Handles lazy-loaded images via scrolling

### 2. Updated ScraperEngine (`src/scraper/ScraperEngine.js`)
   - Updated `saveChapter()` to download images when `contentType === 'image'`
   - Creates a chapter subfolder (e.g., `content/book-id/chapter-177/`)
   - Downloads each image and saves it with sequential filenames (`image_001.jpg`, `image_002.jpg`, etc.)
   - Updates the markdown to reference local image paths instead of URLs
   - Includes error handling to fall back to the original URL if download fails

### Features
- Downloads all chapter images
- Organizes images in chapter-specific subfolders
- Preserves image order as they appear on the page
- Generates markdown with local image references
- Handles various image formats (jpg, png, gif, webp, etc.)
- Robust error handling for failed downloads

The plugin follows the existing plugin pattern and integrates with the scraper. Use it by adding a book with a starting URL from manhuaus.org, and the scraper will download the images and generate markdown files with the proper structure.

