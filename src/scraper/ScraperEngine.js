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
    this.errors = []; // Accumulate errors during scraping
  }

  async scrapeBook(bookId, forceSave = false) {
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
        // Start from starting path (or root path for backward compatibility)
        const startPath = book.startingPath || book.rootPath;
        currentUrl = this.buildUrl(rootSite.domain, startPath);
        console.log(`Starting from: ${currentUrl}`);
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
          const hasContent = await plugin.hasContent(page);
          if (!hasContent) {
            console.log('No content detected on page');
            // Try to get next chapter URL - if this was the last scraped page and it's now empty,
            // we should try the next page instead of stopping
            const nextUrl = await plugin.getNextChapterUrl(page);
            if (nextUrl) {
              // Validate that URL contains root path
              const urlValidation = this.validateUrlContainsRootPath(nextUrl, book.rootPath);
              if (!urlValidation.valid) {
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
            maxScrolls: 10
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

  async scrapeBookReverse(bookId, initialChapterNumber = null, forceSave = false) {
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

      // Start from starting path (or root path for backward compatibility)
      const startPath = book.startingPath || book.rootPath;
      let currentUrl = this.buildUrl(rootSite.domain, startPath);
      
      // If chapter number not provided, scrape the initial page to get it
      let chapterNumber = initialChapterNumber;
      if (chapterNumber === null || chapterNumber === undefined) {
        console.log(`No chapter number provided. Scraping initial page to determine chapter number...`);
        console.log(`Navigating to: ${currentUrl}`);
        
        await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.scrollPage(page);
        
        // Check if page has content
        const hasContent = await plugin.hasContent(page);
        if (!hasContent) {
          throw new Error('Initial page has no content. Cannot determine chapter number.');
        }
        
        // Scrape the initial page to get chapter number
        const initialChapterData = await plugin.scrapeChapter(currentUrl, page, {
          scrollDelay: 1000,
          maxScrolls: 10
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
          const hasContent = await plugin.hasContent(page);
          if (!hasContent) {
            console.log('No content detected on page');
            // Try to get previous chapter URL - if this was the last scraped page and it's now empty,
            // we should try the previous page instead of stopping
            const prevUrl = await plugin.getPreviousChapterUrl(page);
            if (prevUrl) {
              // Validate that URL contains root path
              const urlValidation = this.validateUrlContainsRootPath(prevUrl, book.rootPath);
              if (!urlValidation.valid) {
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
            maxScrolls: 10
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
    
    // Check if URL path contains the root path
    // This ensures the URL is still part of the same book
    if (!urlPath.includes(rootPath)) {
      return {
        valid: false,
        reason: `URL path does not contain root path "${rootPath}"`
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



