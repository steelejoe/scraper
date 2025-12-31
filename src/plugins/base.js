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
 * @returns {Promise<Object>} - Object with { title, content, images? }
 */
export async function scrapeChapter(url, page, options = {}) {
  // Implement site-specific scraping logic
  // Should handle:
  // - Scrolling to load lazy content (if needed)
  // - Extracting title
  // - Extracting text content
  // - Extracting images (if applicable)
  // 
  // Return format:
  // {
  //   title: string,
  //   content: string,  // Text content
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


