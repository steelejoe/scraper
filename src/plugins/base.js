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
 * Base Plugin Template
 * 
 * This file serves as a reference for the plugin interface.
 * Each plugin must implement all required methods.
 * 
 * Copy this file to create a new plugin: src/plugins/{domain}.js
 */

/**
 * REQUIRED: Extracts the "next chapter" URL from the current page.
 * This is called after scraping a chapter to find the next chapter link.
 * 
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<string|null>} - Next chapter URL or null if no next chapter exists
 */
export async function getNextChapterUrl(page) {
  // Implement site-specific logic to find the "next chapter" link
  // Example:
  // const nextLink = await page.$('a.next-chapter');
  // if (!nextLink) return null;
  // const href = await page.evaluate(el => el.href, nextLink);
  // return href || null;
  
  throw new Error('getNextChapterUrl must be implemented by plugin');
}

/**
 * REQUIRED: Extracts the "previous chapter" URL from the current page.
 * This is used for reverse scraping to find the previous chapter link.
 * 
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<string|null>} - Previous chapter URL or null if no previous chapter exists
 */
export async function getPreviousChapterUrl(page) {
  // Implement site-specific logic to find the "previous chapter" link
  // Example:
  // const prevLink = await page.$('a.prev-chapter, a.previous-chapter');
  // if (!prevLink) return null;
  // const href = await page.evaluate(el => el.href, prevLink);
  // return href || null;
  
  throw new Error('getPreviousChapterUrl must be implemented by plugin');
}

/**
 * REQUIRED: Detects if the current page has actual content.
 * This prevents updating lastPathScraped when navigating to empty/placeholder pages.
 * 
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<boolean>} - True if page has content, false otherwise
 */
export async function hasContent(page) {
  // Implement site-specific logic to detect if page has content
  // Example:
  // const contentEl = await page.$('.chapter-content');
  // if (!contentEl) return false;
  // const text = await page.evaluate(el => el.textContent.trim(), contentEl);
  // return text && text.length > 50;
  
  throw new Error('hasContent must be implemented by plugin');
}

/**
 * REQUIRED: Scrapes a single chapter page.
 * Handles scrolling and extracts content (text and/or images).
 * 
 * @param {string} url - The URL of the chapter to scrape
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Scraping options (scrollDelay, maxScrolls, etc.)
 * @param {number} options.chapterNumber - Optional chapter number if known (for reverse scraping)
 * @returns {Promise<Object>} - Object with { title, content, chapterNumber, bookTitle?, images? }
 */
export async function scrapeChapter(url, page, options = {}) {
  // Implement site-specific scraping logic
  // Should handle:
  // - Scrolling to load lazy content (if needed)
  // - Extracting title
  // - Extracting chapter number (from URL, title, or page content)
  // - Extracting text content
  // - Extracting images (if applicable)
  // - Extracting book title (optional, only if not already set in book record)
  // 
  // Return format:
  // {
  //   title: string,  // Chapter title
  //   content: string,  // Text content
  //   chapterNumber: number,  // Chapter number for ordering
  //   bookTitle?: string,  // Optional: Book title (only used if book record doesn't have a title)
  //   images?: string[] // Optional array of image URLs
  // }
  
  throw new Error('scrapeChapter must be implemented by plugin');
}

/**
 * REQUIRED: Returns the content type this plugin handles.
 * 
 * @returns {'text' | 'image'} - Content type
 */
export function getContentType() {
  // Return 'text' for text-based content
  // Return 'image' for image-based content (like manga/comics)
  return 'text';
}

/**
 * OPTIONAL: Returns whether this site uses Cloudflare protection.
 * Default implementation returns false. Override in plugins for sites that use Cloudflare.
 * 
 * @returns {boolean} - True if site uses Cloudflare, false otherwise
 */
export function isCloudflarePage() {
  return false; // Default: no Cloudflare
}

/**
 * OPTIONAL: Handles authentication/login for sites that require it.
 * Only called if credentials are provided in the root site configuration.
 * 
 * @param {Object} credentials - { username, password }
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<void>}
 */
export async function login(credentials, page) {
  // Implement site-specific login logic
  // Example:
  // await page.goto('https://example.com/login');
  // await page.type('#username', credentials.username);
  // await page.type('#password', credentials.password);
  // await page.click('button[type="submit"]');
  // await page.waitForNavigation();
  
  // If not needed, you can leave this empty or not export it
}


