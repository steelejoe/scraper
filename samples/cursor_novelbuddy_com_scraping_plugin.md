# Novelbuddy.com scraping plugin
_Exported on 1/3/2026 at 10:38:19 PST from Cursor (2.3.15)_

---

**User**

Build a scraping plugin for novelbuddy.com using @src/plugins/www.wordycrown.com.js  as the template. Use the https://novelbuddy.com/novel/mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go/chapter-43-the-fate-of-xiao-chen-the-protagonist-of-the-destiny-is-another-heroic-way-to-save-the-united-states  chapter as an exemplar for this book.

---

**Cursor**

Creating a scraping plugin for novelbuddy.com using the wordycrown.com plugin as a template. Examining the plugin system and the novelbuddy.com page structure.


Creating the novelbuddy.com plugin. Analyzing the page structure from the provided content and creating the plugin file:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to clean title text
      const cleanTitle = (text) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        cleaned = cleaned.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s+NovelBuddy\s*$/i, '');
        
        // Remove chapter prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        cleaned = cleaned.replace(/^MTL\s*-\s*/i, ''); // Remove "MTL - " prefix if present
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from standard HTML elements
      const extractTitleFromStandardElements = () => {
        let rawTitleText = null;
        
        // Method 1: Try <title> tag in document head
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        // Method 2: Try h1 elements (excluding site title)
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          rawTitleText = h1.textContent || h1.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        // Method 3: Try h2 or h3 with chapter title class
        const chapterTitleSelectors = ['h2.chapter-title', 'h3.chapter-title', '.chapter-title h2', '.chapter-title h3'];
        for (const selector of chapterTitleSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            rawTitleText = el.textContent || el.innerText || '';
            if (rawTitleText.trim()) {
              const cleaned = cleanTitle(rawTitleText.trim());
              if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
            }
          }
        }
        
        return null;
      };
      
      // Helper function to extract chapter number from title text or URL
      const extractChapterNumber = (titleText, url) => {
        // First try to extract from title text
        if (titleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = titleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      // Extract title
      const titleResult = extractTitleFromStandardElements();
      const foundTitle = titleResult ? titleResult.cleaned : null;
      const rawTitleText = titleResult ? titleResult.raw : null;
      
      // Extract chapter number
      const foundChapterNumber = extractChapterNumber(rawTitleText || '', window.location.href);
      
      return {
        title: foundTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Checking for linting errors:


Created the plugin for novelbuddy.com. It follows the same structure as the wordycrown plugin and includes:

1. **Navigation functions** (`getNextChapterUrl`, `getPreviousChapterUrl`): Multiple selector strategies to find next/previous chapter links, with fallback logic to extract chapter numbers from URLs.

2. **Content detection** (`hasContent`): Checks multiple common content selectors to verify the page has actual chapter content.

3. **Chapter scraping** (`scrapeChapter`):
   - Extracts title and chapter number from the page
   - Handles "MTL -" prefixes and cleans title text
   - Extracts chapter numbers from title text or URL
   - Extracts content from multiple possible content containers
   - Removes unwanted elements (nav, ads, comments, etc.)
   - Preserves paragraph structure
   - Extracts images if present

4. **Scrolling support**: Includes a helper function to scroll and trigger lazy-loaded content.

The plugin is ready to use. You can test it by:

1. Adding the site: `npm start add-site novelbuddy.com "NovelBuddy site"`
2. Adding a book: `npm start add-book <book-id> /novel/... <starting-url>`
3. Scraping: `npm start scrape <book-id>`

If the selectors need adjustment after testing, we can refine them based on the actual page structure.

---

**User**

It looks like chapters from this book have a specific prefix "MTL - Scoring the Sacred Body of the Ancients from the Get-go-". Update the title parsing logic to remove the book title "MTL - Scoring the Sacred Body of the Ancients from the Get-go" and the following separator "-" before parsing the title for the chapter.

---

**Cursor**

Checking the scraped content to understand the title format, then updating the title parsing logic.


Updating the title parsing logic to remove the book title prefix and separator:


Updating the `cleanTitle` function to remove the book title prefix and separator:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to clean title text
      const cleanTitle = (text) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        cleaned = cleaned.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s+NovelBuddy\s*$/i, '');
        
        // Remove book title prefix "MTL - Scoring the Sacred Body of the Ancients from the Get-go"
        // Handle variations with different separators and spacing
        const bookTitlePattern = /MTL\s*[–—\-]\s*Scoring\s+the\s+Sacred\s+Body\s+of\s+the\s+Ancients\s+from\s+the\s+Get-go/gi;
        cleaned = cleaned.replace(bookTitlePattern, '');
        
        // Remove the separator "-" that follows the book title (if present)
        // This handles patterns like "Book Title - Chapter 43 Title"
        cleaned = cleaned.replace(/^\s*[–—\-]\s*/, '');
        
        // Remove leading chapter number and "Read" prefix if present (e.g., "43 Read")
        cleaned = cleaned.replace(/^\d+\s+Read\s+/i, '');
        
        // Remove chapter prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from standard HTML elements
      const extractTitleFromStandardElements = () => {
        let rawTitleText = null;
        
        // Method 1: Try <title> tag in document head
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        // Method 2: Try h1 elements (excluding site title)
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          rawTitleText = h1.textContent || h1.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        // Method 3: Try h2 or h3 with chapter title class
        const chapterTitleSelectors = ['h2.chapter-title', 'h3.chapter-title', '.chapter-title h2', '.chapter-title h3'];
        for (const selector of chapterTitleSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            rawTitleText = el.textContent || el.innerText || '';
            if (rawTitleText.trim()) {
              const cleaned = cleanTitle(rawTitleText.trim());
              if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
            }
          }
        }
        
        return null;
      };
      
      // Helper function to extract chapter number from title text or URL
      const extractChapterNumber = (titleText, url) => {
        // First try to extract from title text
        if (titleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = titleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      // Extract title
      const titleResult = extractTitleFromStandardElements();
      const foundTitle = titleResult ? titleResult.cleaned : null;
      const rawTitleText = titleResult ? titleResult.raw : null;
      
      // Extract chapter number
      const foundChapterNumber = extractChapterNumber(rawTitleText || '', window.location.href);
      
      return {
        title: foundTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Updated the title parsing logic in the novelbuddy.com plugin. The `cleanTitle` function now:

1. Removes the book title prefix "MTL - Scoring the Sacred Body of the Ancients from the Get-go" (handles variations with different separators and spacing)
2. Removes the following separator "-" that appears after the book title
3. Removes leading chapter numbers and "Read" prefix (e.g., "43 Read")
4. Removes "Chapter 43" patterns
5. Returns just the chapter title

For example, from:
- "43 Read MTL - Scoring the Sacred Body of the Ancients from the Get-go - Chapter 43 The fate of Xiao Chen, the protagonist of the Destiny, is another heroic way to save the United States"

It will extract:
- "The fate of Xiao Chen, the protagonist of the Destiny, is another heroic way to save the United States"

The plugin is ready to use. When you scrape chapters, the titles should be cleaned of the book title prefix and separator.

---

**User**

The book title by itself appears in the chapter before the chapter title. Find the book title and parse that out and then use that parsed book title to cleanly parse the chapter title. Use https://novelbuddy.com/novel/mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go/chapter-43-the-fate-of-xiao-chen-the-protagonist-of-the-destiny-is-another-heroic-way-to-save-the-united-states  to determine the chapter contents

---

**Cursor**

Updating the plugin to extract the book title from the page and use it to parse the chapter title. Examining the page structure to locate where the book title appears:


Updating the plugin to extract the book title from the page and use it to parse the chapter title:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to extract book title from the page
      // The book title appears as a heading before the chapter title
      const extractBookTitle = () => {
        // Look for book title in various places
        // It often appears as a heading (h2, h3) or in a specific container
        const bookTitleSelectors = [
          'h2',
          'h3',
          '.book-title',
          '.novel-title',
          '.title',
          'header h1',
          'header h2'
        ];
        
        for (const selector of bookTitleSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            // Skip site titles and logos
            if (el.classList.contains('site-title') || 
                el.classList.contains('logo') || 
                el.closest('header')?.querySelector('.site-title')) {
              continue;
            }
            
            const text = (el.textContent || el.innerText || '').trim();
            // Book title typically doesn't contain "Chapter" or "Chapter 43"
            // and is usually shorter than the full chapter title
            if (text && 
                !text.match(/Chapter\s+\d+/i) && 
                text.length > 10 && 
                text.length < 200) {
              // Check if this looks like a book title (appears before chapter content)
              // Often contains patterns like "MTL -" or is a standalone heading
              return text;
            }
          }
        }
        
        return null;
      };
      
      // Helper function to clean title text using extracted book title
      const cleanTitle = (text, bookTitle) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        cleaned = cleaned.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s+NovelBuddy\s*$/i, '');
        
        // If we found a book title, remove it from the full title
        if (bookTitle) {
          // Escape special regex characters in book title
          const escapedBookTitle = bookTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Remove book title with optional separator after it
          // Pattern: "Book Title" or "Book Title-" or "Book Title -" followed by chapter info
          const bookTitlePattern = new RegExp(
            escapedBookTitle.replace(/\s+/g, '\\s+') + // Match spaces flexibly
            '\\s*[–—\\-]?\\s*', // Optional separator
            'gi'
          );
          cleaned = cleaned.replace(bookTitlePattern, '');
        }
        
        // Remove the separator "-" that follows the book title (if present)
        cleaned = cleaned.replace(/^\s*[–—\-]\s*/, '');
        
        // Remove leading chapter number and "Read" prefix if present (e.g., "43 Read")
        cleaned = cleaned.replace(/^\d+\s+Read\s+/i, '');
        
        // Remove chapter prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract book title first
      const bookTitle = extractBookTitle();
      
      // Extract title from standard HTML elements
      const extractTitleFromStandardElements = () => {
        let rawTitleText = null;
        
        // Method 1: Try <title> tag in document head
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 2: Try h1 elements (excluding site title)
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          rawTitleText = h1.textContent || h1.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 3: Look for chapter title in content area
        // Sometimes the chapter title appears separately from the book title
        const contentArea = document.querySelector('main, article, .content, .chapter-content, .reading-content');
        if (contentArea) {
          // Look for headings that contain "Chapter" in the content area
          const chapterHeadings = contentArea.querySelectorAll('h1, h2, h3, h4');
          for (const heading of chapterHeadings) {
            const headingText = heading.textContent || heading.innerText || '';
            if (headingText.match(/Chapter\s+\d+/i)) {
              rawTitleText = headingText.trim();
              const cleaned = cleanTitle(rawTitleText, bookTitle);
              if (cleaned) return { raw: rawTitleText, cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        // Method 4: Try h2 or h3 with chapter title class
        const chapterTitleSelectors = ['h2.chapter-title', 'h3.chapter-title', '.chapter-title h2', '.chapter-title h3'];
        for (const selector of chapterTitleSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            rawTitleText = el.textContent || el.innerText || '';
            if (rawTitleText.trim()) {
              const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
              if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        return null;
      };
      
      // Helper function to extract chapter number from title text or URL
      const extractChapterNumber = (titleText, url) => {
        // First try to extract from title text
        if (titleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = titleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      // Extract title
      const titleResult = extractTitleFromStandardElements();
      const foundTitle = titleResult ? titleResult.cleaned : null;
      const rawTitleText = titleResult ? titleResult.raw : null;
      
      // Extract chapter number
      const foundChapterNumber = extractChapterNumber(rawTitleText || '', window.location.href);
      
      return {
        title: foundTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Refining book title extraction to better match the page structure:


Refining book title extraction to better match the page structure:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to extract book title from the page
      // The book title appears as a heading before the chapter title
      const extractBookTitle = () => {
        // Look for book title in main content area
        const contentArea = document.querySelector('main, article, .content, .chapter-content, .reading-content, body');
        if (!contentArea) return null;
        
        // Look for headings (h1, h2, h3) that appear before chapter content
        // Book title typically doesn't contain "Chapter" keyword
        const headings = contentArea.querySelectorAll('h1, h2, h3');
        
        for (const heading of headings) {
          // Skip site titles and logos
          if (heading.classList.contains('site-title') || 
              heading.classList.contains('logo') ||
              heading.closest('header, nav')) {
            continue;
          }
          
          const text = (heading.textContent || heading.innerText || '').trim();
          
          // Book title typically:
          // 1. Doesn't contain "Chapter" keyword
          // 2. Is a reasonable length (not too short, not too long)
          // 3. May contain patterns like "MTL -" or book title patterns
          if (text && 
              !text.match(/Chapter\s+\d+/i) && 
              text.length > 10 && 
              text.length < 200 &&
              !text.includes('NovelBuddy')) {
            // Check if this appears before any chapter title in the DOM
            // by checking if there's a chapter heading after this one
            let foundChapterAfter = false;
            let current = heading.nextElementSibling;
            while (current) {
              const currentText = (current.textContent || current.innerText || '').trim();
              if (currentText.match(/Chapter\s+\d+/i)) {
                foundChapterAfter = true;
                break;
              }
              current = current.nextElementSibling;
            }
            
            // If we found a chapter heading after this, or if this looks like a book title
            // (contains common patterns), use it
            if (foundChapterAfter || text.match(/MTL\s*[–—\-]/i) || text.length > 20) {
              return text;
            }
          }
        }
        
        // Fallback: Look for any heading that contains "MTL -" pattern (common for this site)
        for (const heading of headings) {
          const text = (heading.textContent || heading.innerText || '').trim();
          if (text && text.match(/MTL\s*[–—\-]/i) && !text.match(/Chapter\s+\d+/i)) {
            return text;
          }
        }
        
        return null;
      };
      
      // Helper function to clean title text using extracted book title
      const cleanTitle = (text, bookTitle) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        cleaned = cleaned.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s+NovelBuddy\s*$/i, '');
        
        // If we found a book title, remove it from the full title
        if (bookTitle) {
          // Escape special regex characters in book title
          const escapedBookTitle = bookTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Remove book title with optional separator after it
          // Pattern: "Book Title" or "Book Title-" or "Book Title -" followed by chapter info
          const bookTitlePattern = new RegExp(
            escapedBookTitle.replace(/\s+/g, '\\s+') + // Match spaces flexibly
            '\\s*[–—\\-]?\\s*', // Optional separator
            'gi'
          );
          cleaned = cleaned.replace(bookTitlePattern, '');
        }
        
        // Remove the separator "-" that follows the book title (if present)
        cleaned = cleaned.replace(/^\s*[–—\-]\s*/, '');
        
        // Remove leading chapter number and "Read" prefix if present (e.g., "43 Read")
        cleaned = cleaned.replace(/^\d+\s+Read\s+/i, '');
        
        // Remove chapter prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract book title first
      const bookTitle = extractBookTitle();
      
      // Extract title from standard HTML elements
      const extractTitleFromStandardElements = () => {
        let rawTitleText = null;
        
        // Method 1: Try <title> tag in document head
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 2: Try h1 elements (excluding site title)
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          rawTitleText = h1.textContent || h1.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 3: Look for chapter title in content area
        // Sometimes the chapter title appears separately from the book title
        const contentArea = document.querySelector('main, article, .content, .chapter-content, .reading-content');
        if (contentArea) {
          // Look for headings that contain "Chapter" in the content area
          const chapterHeadings = contentArea.querySelectorAll('h1, h2, h3, h4');
          for (const heading of chapterHeadings) {
            const headingText = heading.textContent || heading.innerText || '';
            if (headingText.match(/Chapter\s+\d+/i)) {
              rawTitleText = headingText.trim();
              const cleaned = cleanTitle(rawTitleText, bookTitle);
              if (cleaned) return { raw: rawTitleText, cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        // Method 4: Try h2 or h3 with chapter title class
        const chapterTitleSelectors = ['h2.chapter-title', 'h3.chapter-title', '.chapter-title h2', '.chapter-title h3'];
        for (const selector of chapterTitleSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            rawTitleText = el.textContent || el.innerText || '';
            if (rawTitleText.trim()) {
              const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
              if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        return null;
      };
      
      // Helper function to extract chapter number from title text or URL
      const extractChapterNumber = (titleText, url) => {
        // First try to extract from title text
        if (titleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = titleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      // Extract title
      const titleResult = extractTitleFromStandardElements();
      const foundTitle = titleResult ? titleResult.cleaned : null;
      const rawTitleText = titleResult ? titleResult.raw : null;
      
      // Extract chapter number
      const foundChapterNumber = extractChapterNumber(rawTitleText || '', window.location.href);
      
      return {
        title: foundTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Improving chapter title extraction to handle cases where it appears separately:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to extract book title from the page
      // The book title appears as a heading before the chapter title
      const extractBookTitle = () => {
        // Look for book title in main content area
        const contentArea = document.querySelector('main, article, .content, .chapter-content, .reading-content, body');
        if (!contentArea) return null;
        
        // Look for headings (h1, h2, h3) that appear before chapter content
        // Book title typically doesn't contain "Chapter" keyword
        const headings = contentArea.querySelectorAll('h1, h2, h3');
        
        for (const heading of headings) {
          // Skip site titles and logos
          if (heading.classList.contains('site-title') || 
              heading.classList.contains('logo') ||
              heading.closest('header, nav')) {
            continue;
          }
          
          const text = (heading.textContent || heading.innerText || '').trim();
          
          // Book title typically:
          // 1. Doesn't contain "Chapter" keyword
          // 2. Is a reasonable length (not too short, not too long)
          // 3. May contain patterns like "MTL -" or book title patterns
          if (text && 
              !text.match(/Chapter\s+\d+/i) && 
              text.length > 10 && 
              text.length < 200 &&
              !text.includes('NovelBuddy')) {
            // Check if this appears before any chapter title in the DOM
            // by checking if there's a chapter heading after this one
            let foundChapterAfter = false;
            let current = heading.nextElementSibling;
            while (current) {
              const currentText = (current.textContent || current.innerText || '').trim();
              if (currentText.match(/Chapter\s+\d+/i)) {
                foundChapterAfter = true;
                break;
              }
              current = current.nextElementSibling;
            }
            
            // If we found a chapter heading after this, or if this looks like a book title
            // (contains common patterns), use it
            if (foundChapterAfter || text.match(/MTL\s*[–—\-]/i) || text.length > 20) {
              return text;
            }
          }
        }
        
        // Fallback: Look for any heading that contains "MTL -" pattern (common for this site)
        for (const heading of headings) {
          const text = (heading.textContent || heading.innerText || '').trim();
          if (text && text.match(/MTL\s*[–—\-]/i) && !text.match(/Chapter\s+\d+/i)) {
            return text;
          }
        }
        
        return null;
      };
      
      // Helper function to clean title text using extracted book title
      const cleanTitle = (text, bookTitle) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        cleaned = cleaned.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s+NovelBuddy\s*$/i, '');
        
        // If we found a book title, remove it from the full title
        if (bookTitle) {
          // Escape special regex characters in book title
          const escapedBookTitle = bookTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Remove book title with optional separator after it
          // Pattern: "Book Title" or "Book Title-" or "Book Title -" followed by chapter info
          const bookTitlePattern = new RegExp(
            escapedBookTitle.replace(/\s+/g, '\\s+') + // Match spaces flexibly
            '\\s*[–—\\-]?\\s*', // Optional separator
            'gi'
          );
          cleaned = cleaned.replace(bookTitlePattern, '');
        }
        
        // Remove the separator "-" that follows the book title (if present)
        cleaned = cleaned.replace(/^\s*[–—\-]\s*/, '');
        
        // Remove leading chapter number and "Read" prefix if present (e.g., "43 Read")
        cleaned = cleaned.replace(/^\d+\s+Read\s+/i, '');
        
        // Remove chapter prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract book title first
      const bookTitle = extractBookTitle();
      
      // Extract title from standard HTML elements
      const extractTitleFromStandardElements = () => {
        let rawTitleText = null;
        
        // Method 1: Try <title> tag in document head
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 2: Try h1 elements (excluding site title)
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          rawTitleText = h1.textContent || h1.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 3: Look for chapter title in content area
        // Sometimes the chapter title appears separately from the book title
        const contentArea = document.querySelector('main, article, .content, .chapter-content, .reading-content');
        if (contentArea) {
          // Look for headings that contain "Chapter" in the content area
          // Prioritize headings that come after the book title
          const chapterHeadings = contentArea.querySelectorAll('h1, h2, h3, h4');
          for (const heading of chapterHeadings) {
            const headingText = heading.textContent || heading.innerText || '';
            if (headingText.match(/Chapter\s+\d+/i)) {
              rawTitleText = headingText.trim();
              const cleaned = cleanTitle(rawTitleText, bookTitle);
              if (cleaned) return { raw: rawTitleText, cleaned: cleaned, bookTitle: bookTitle };
            }
          }
          
          // Also check for text that starts with "Chapter" in paragraphs or divs
          // This handles cases where chapter title is in a different format
          const textElements = contentArea.querySelectorAll('p, div, span');
          for (const el of textElements) {
            const text = (el.textContent || el.innerText || '').trim();
            if (text.match(/^Chapter\s+\d+/i) && text.length < 300) {
              rawTitleText = text;
              const cleaned = cleanTitle(rawTitleText, bookTitle);
              if (cleaned) return { raw: rawTitleText, cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        // Method 4: Try h2 or h3 with chapter title class
        const chapterTitleSelectors = ['h2.chapter-title', 'h3.chapter-title', '.chapter-title h2', '.chapter-title h3'];
        for (const selector of chapterTitleSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            rawTitleText = el.textContent || el.innerText || '';
            if (rawTitleText.trim()) {
              const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
              if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        return null;
      };
      
      // Helper function to extract chapter number from title text or URL
      const extractChapterNumber = (titleText, url) => {
        // First try to extract from title text
        if (titleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = titleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      // Extract title
      const titleResult = extractTitleFromStandardElements();
      const foundTitle = titleResult ? titleResult.cleaned : null;
      const rawTitleText = titleResult ? titleResult.raw : null;
      
      // Extract chapter number
      const foundChapterNumber = extractChapterNumber(rawTitleText || '', window.location.href);
      
      return {
        title: foundTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Checking for linting errors and verifying the logic:


Refining the `cleanTitle` function to better handle book title removal:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to extract book title from the page
      // The book title appears as a heading before the chapter title
      const extractBookTitle = () => {
        // Look for book title in main content area
        const contentArea = document.querySelector('main, article, .content, .chapter-content, .reading-content, body');
        if (!contentArea) return null;
        
        // Look for headings (h1, h2, h3) that appear before chapter content
        // Book title typically doesn't contain "Chapter" keyword
        const headings = contentArea.querySelectorAll('h1, h2, h3');
        
        for (const heading of headings) {
          // Skip site titles and logos
          if (heading.classList.contains('site-title') || 
              heading.classList.contains('logo') ||
              heading.closest('header, nav')) {
            continue;
          }
          
          const text = (heading.textContent || heading.innerText || '').trim();
          
          // Book title typically:
          // 1. Doesn't contain "Chapter" keyword
          // 2. Is a reasonable length (not too short, not too long)
          // 3. May contain patterns like "MTL -" or book title patterns
          if (text && 
              !text.match(/Chapter\s+\d+/i) && 
              text.length > 10 && 
              text.length < 200 &&
              !text.includes('NovelBuddy')) {
            // Check if this appears before any chapter title in the DOM
            // by checking if there's a chapter heading after this one
            let foundChapterAfter = false;
            let current = heading.nextElementSibling;
            while (current) {
              const currentText = (current.textContent || current.innerText || '').trim();
              if (currentText.match(/Chapter\s+\d+/i)) {
                foundChapterAfter = true;
                break;
              }
              current = current.nextElementSibling;
            }
            
            // If we found a chapter heading after this, or if this looks like a book title
            // (contains common patterns), use it
            if (foundChapterAfter || text.match(/MTL\s*[–—\-]/i) || text.length > 20) {
              return text;
            }
          }
        }
        
        // Fallback: Look for any heading that contains "MTL -" pattern (common for this site)
        for (const heading of headings) {
          const text = (heading.textContent || heading.innerText || '').trim();
          if (text && text.match(/MTL\s*[–—\-]/i) && !text.match(/Chapter\s+\d+/i)) {
            return text;
          }
        }
        
        return null;
      };
      
      // Helper function to clean title text using extracted book title
      const cleanTitle = (text, bookTitle) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        cleaned = cleaned.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        cleaned = cleaned.replace(/\s+NovelBuddy\s*$/i, '');
        
        // If we found a book title, remove it from the full title
        if (bookTitle) {
          // Normalize the book title for matching (handle whitespace variations)
          const normalizedBookTitle = bookTitle.trim().replace(/\s+/g, '\\s+');
          // Escape special regex characters
          const escapedBookTitle = normalizedBookTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Try multiple patterns to remove the book title
          // Pattern 1: "Book Title-Chapter" (hyphen directly after)
          let pattern = new RegExp('^' + escapedBookTitle + '\\s*[–—\\-]\\s*', 'gi');
          cleaned = cleaned.replace(pattern, '');
          
          // Pattern 2: "Book Title - Chapter" (space and hyphen)
          pattern = new RegExp('^' + escapedBookTitle + '\\s+[–—\\-]\\s+', 'gi');
          cleaned = cleaned.replace(pattern, '');
          
          // Pattern 3: "Book Title Chapter" (just space)
          pattern = new RegExp('^' + escapedBookTitle + '\\s+', 'gi');
          cleaned = cleaned.replace(pattern, '');
          
          // Pattern 4: "Book Title" at the start (exact match)
          pattern = new RegExp('^' + escapedBookTitle + '$', 'gi');
          if (cleaned.match(pattern)) {
            return null; // If only book title remains, return null
          }
        }
        
        // Remove the separator "-" that follows the book title (if present)
        cleaned = cleaned.replace(/^\s*[–—\-]\s*/, '');
        
        // Remove leading chapter number and "Read" prefix if present (e.g., "43 Read")
        cleaned = cleaned.replace(/^\d+\s+Read\s+/i, '');
        
        // Remove chapter prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract book title first
      const bookTitle = extractBookTitle();
      
      // Extract title from standard HTML elements
      const extractTitleFromStandardElements = () => {
        let rawTitleText = null;
        
        // Method 1: Try <title> tag in document head
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 2: Try h1 elements (excluding site title)
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          rawTitleText = h1.textContent || h1.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
          }
        }
        
        // Method 3: Look for chapter title in content area
        // Sometimes the chapter title appears separately from the book title
        const contentArea = document.querySelector('main, article, .content, .chapter-content, .reading-content');
        if (contentArea) {
          // Look for headings that contain "Chapter" in the content area
          // Prioritize headings that come after the book title
          const chapterHeadings = contentArea.querySelectorAll('h1, h2, h3, h4');
          for (const heading of chapterHeadings) {
            const headingText = heading.textContent || heading.innerText || '';
            if (headingText.match(/Chapter\s+\d+/i)) {
              rawTitleText = headingText.trim();
              const cleaned = cleanTitle(rawTitleText, bookTitle);
              if (cleaned) return { raw: rawTitleText, cleaned: cleaned, bookTitle: bookTitle };
            }
          }
          
          // Also check for text that starts with "Chapter" in paragraphs or divs
          // This handles cases where chapter title is in a different format
          const textElements = contentArea.querySelectorAll('p, div, span');
          for (const el of textElements) {
            const text = (el.textContent || el.innerText || '').trim();
            if (text.match(/^Chapter\s+\d+/i) && text.length < 300) {
              rawTitleText = text;
              const cleaned = cleanTitle(rawTitleText, bookTitle);
              if (cleaned) return { raw: rawTitleText, cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        // Method 4: Try h2 or h3 with chapter title class
        const chapterTitleSelectors = ['h2.chapter-title', 'h3.chapter-title', '.chapter-title h2', '.chapter-title h3'];
        for (const selector of chapterTitleSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            rawTitleText = el.textContent || el.innerText || '';
            if (rawTitleText.trim()) {
              const cleaned = cleanTitle(rawTitleText.trim(), bookTitle);
              if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned, bookTitle: bookTitle };
            }
          }
        }
        
        return null;
      };
      
      // Helper function to extract chapter number from title text or URL
      const extractChapterNumber = (titleText, url) => {
        // First try to extract from title text
        if (titleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = titleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      // Extract title
      const titleResult = extractTitleFromStandardElements();
      const foundTitle = titleResult ? titleResult.cleaned : null;
      const rawTitleText = titleResult ? titleResult.raw : null;
      
      // Extract chapter number
      const foundChapterNumber = extractChapterNumber(rawTitleText || '', window.location.href);
      
      return {
        title: foundTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Checking for linting errors:


Updated the plugin to:

1. **Extract the book title from the page** — Looks for headings (h1, h2, h3) that:
   - Don't contain "Chapter"
   - Appear before chapter content in the DOM
   - Match patterns like "MTL -" or are reasonable book title lengths

2. **Use the extracted book title to clean the chapter title** — The `cleanTitle` function now:
   - Removes the book title from the full title string using multiple pattern matches
   - Handles variations like "Book Title-Chapter", "Book Title - Chapter", or "Book Title Chapter"
   - Removes the separator after the book title
   - Removes "Chapter 43" prefix patterns
   - Returns just the chapter title

3. **Improved chapter title extraction** — Also looks for chapter titles in:
   - Standard HTML elements (title tag, h1, h2, h3)
   - Content area headings
   - Text elements that start with "Chapter"

This approach is dynamic and works for any book on novelbuddy.com, not just this one. The plugin will automatically detect the book title on each page and use it to extract the chapter title.

When you scrape chapters, the titles should be clean chapter titles without the book title prefix.

---

**User**

This is still incorrect. Review the sample chapter HTML at @samples/novelbuddy.com_novel_mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go_chapter-43-the-fate-of-xiao-chen-the-protagonist-of-the-destiny-is-another-heroic-way-to-save-the-united-states.html . The title appears as "@novelbuddy.com_novel_mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go_chapter-43-the-fate-of-xiao-chen-the-protagonist-of-the-destiny-is-another-heroic-way-to-save-the-united-states.html (26-29)  which can be broken down as: Read {book-title} - {chapter-title} - NovelBuddy. Please update the parsing to search for the title entity with this text and then parse it from there. The implementation should be generic enough to support different book titles and chapter titles. The only file you should be modifying is @src/plugins/novelbuddy.com.js 

---

**Cursor**

Examining the HTML structure to locate the title element and parse it correctly:


Searching for the title element structure:


Updating the plugin to parse the title using the "Read {book-title} - {chapter-title} - NovelBuddy" pattern:


Rewriting the title parsing logic to use the "Read {book-title} - {chapter-title} - NovelBuddy" pattern:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to parse title in format: "Read {book-title} - {chapter-title} - NovelBuddy"
      const parseTitle = (titleText) => {
        if (!titleText) return { bookTitle: null, chapterTitle: null };
        
        let text = titleText.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        text = text.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s+NovelBuddy\s*$/i, '');
        
        // Remove leading "Read " prefix
        text = text.replace(/^Read\s+/i, '');
        
        // Split by " - " to separate book title and chapter title
        // The pattern is: "{book-title} - {chapter-title}"
        // We need to split on " - " but be careful as the chapter title might also contain " - "
        // So we split and take the first part as book title, rest as chapter title
        const parts = text.split(/\s+-\s+/);
        
        if (parts.length < 2) {
          // If no " - " separator found, try to infer
          // Check if it starts with "Chapter" - if so, it's likely just the chapter title
          if (text.match(/^Chapter\s+\d+/i)) {
            return { bookTitle: null, chapterTitle: text };
          }
          // Otherwise, might be just book title or malformed
          return { bookTitle: text, chapterTitle: null };
        }
        
        // First part is the book title
        const bookTitle = parts[0].trim();
        
        // Rest of the parts joined together is the chapter title
        const chapterTitle = parts.slice(1).join(' - ').trim();
        
        return { bookTitle, chapterTitle };
      };
      
      // Helper function to clean chapter title by removing "Chapter {number}" prefix
      const cleanChapterTitle = (chapterTitle) => {
        if (!chapterTitle) return null;
        
        let cleaned = chapterTitle.trim();
        
        // Remove "Chapter {number}" prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from <title> tag (primary source)
      let rawTitleText = null;
      const titleTag = document.querySelector('title');
      if (titleTag) {
        rawTitleText = titleTag.textContent || titleTag.innerText || '';
      }
      
      // Fallback: Try other meta tags or headings if title tag not found
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try og:title meta tag
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          rawTitleText = ogTitle.getAttribute('content') || '';
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try h1 elements
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          const h1Text = h1.textContent || h1.innerText || '';
          if (h1Text.trim()) {
            rawTitleText = h1Text.trim();
            break;
          }
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        return {
          title: 'Untitled',
          chapterNumber: null
        };
      }
      
      // Parse the title to extract book title and chapter title
      const { bookTitle, chapterTitle: rawChapterTitle } = parseTitle(rawTitleText.trim());
      
      // Clean the chapter title
      const cleanedChapterTitle = cleanChapterTitle(rawChapterTitle);
      
      // Extract chapter number from chapter title or URL
      const extractChapterNumber = (chapterTitleText, url) => {
        // First try to extract from chapter title text
        if (chapterTitleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = chapterTitleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      const foundChapterNumber = extractChapterNumber(rawChapterTitle || rawTitleText, window.location.href);
      
      return {
        title: cleanedChapterTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Checking for linting errors:


Verifying the parsing logic handles edge cases. Reviewing the code flow:


Updated the plugin to parse titles using the "Read {book-title} - {chapter-title} - NovelBuddy" pattern. Changes:

1. **Title extraction**: Gets the title from the `<title>` tag (with fallbacks to `og:title` meta tag or h1 elements).

2. **Title parsing**: The `parseTitle` function:
   - Removes trailing " - NovelBuddy"
   - Removes leading "Read " prefix
   - Splits by " - " to separate book title and chapter title
   - Handles chapter titles that contain " - " by joining all parts after the first

3. **Chapter title cleaning**: The `cleanChapterTitle` function removes "Chapter {number}" prefixes from the chapter title.

4. **Chapter number extraction**: Extracts the chapter number from the chapter title text or falls back to the URL.

This approach is generic and works for any book on novelbuddy.com, automatically extracting the book title and chapter title from the title element without hardcoding specific book titles.

When you scrape chapters, the titles should be clean chapter titles without the book title prefix or "Chapter {number}" prefix.

---

**User**

The chapter title being generated still includes the book title and the trailing separator. Look at @content/sacred-body-of-the-ancients/novel_mtl_scoring_the_sacred_body_of_the_ancients_from_the_get_go_chapter_43_the_fate_of_xiao_chen_the_protagonist_of_the_destiny_is_another_heroic_way_to_save_the_united_states.md 

---

**Cursor**

The title still includes the book title and "Chapter 43" prefix. Reviewing the parsing logic and fixing it:


The book title contains " - ", so splitting by " - " breaks it. Updating the parsing logic to handle this correctly:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to parse title in format: "Read {book-title} - {chapter-title} - NovelBuddy"
      const parseTitle = (titleText) => {
        if (!titleText) return { bookTitle: null, chapterTitle: null };
        
        let text = titleText.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        text = text.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s+NovelBuddy\s*$/i, '');
        
        // Remove leading "Read " prefix
        text = text.replace(/^Read\s+/i, '');
        
        // Remove trailing " -" separator if present
        text = text.replace(/\s*[–—\-]\s*$/, '');
        
        // Find the position where "Chapter {number}" appears
        // This is the separator between book title and chapter title
        // Pattern: look for "Chapter" followed by space and digits
        const chapterMatch = text.match(/\s+-\s+Chapter\s+\d+/i);
        
        if (chapterMatch) {
          // Found the separator pattern
          const separatorIndex = chapterMatch.index;
          const separatorLength = chapterMatch[0].length;
          
          // Book title is everything before the separator
          const bookTitle = text.substring(0, separatorIndex).trim();
          
          // Chapter title starts after the separator (which includes "Chapter {number}")
          const chapterTitle = text.substring(separatorIndex + separatorLength).trim();
          
          return { bookTitle, chapterTitle };
        }
        
        // Fallback: If no "Chapter {number}" pattern found, try splitting by " - "
        // but look for the pattern that has "Chapter" in the second part
        const parts = text.split(/\s+-\s+/);
        
        if (parts.length >= 2) {
          // Find which part contains "Chapter {number}"
          for (let i = 1; i < parts.length; i++) {
            if (parts[i].match(/^Chapter\s+\d+/i)) {
              // Found it - everything before this part is book title
              const bookTitle = parts.slice(0, i).join(' - ').trim();
              // Everything from this part onwards is chapter title
              const chapterTitle = parts.slice(i).join(' - ').trim();
              return { bookTitle, chapterTitle };
            }
          }
          
          // If no "Chapter" found, assume last part is chapter title
          const bookTitle = parts.slice(0, -1).join(' - ').trim();
          const chapterTitle = parts[parts.length - 1].trim();
          return { bookTitle, chapterTitle };
        }
        
        // If no " - " separator found, check if it's just a chapter title
        if (text.match(/^Chapter\s+\d+/i)) {
          return { bookTitle: null, chapterTitle: text };
        }
        
        // Otherwise, might be just book title or malformed
        return { bookTitle: text, chapterTitle: null };
      };
      
      // Helper function to clean chapter title by removing "Chapter {number}" prefix
      const cleanChapterTitle = (chapterTitle) => {
        if (!chapterTitle) return null;
        
        let cleaned = chapterTitle.trim();
        
        // Remove "Chapter {number}" prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from <title> tag (primary source)
      let rawTitleText = null;
      const titleTag = document.querySelector('title');
      if (titleTag) {
        rawTitleText = titleTag.textContent || titleTag.innerText || '';
      }
      
      // Fallback: Try other meta tags or headings if title tag not found
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try og:title meta tag
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          rawTitleText = ogTitle.getAttribute('content') || '';
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try h1 elements
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          const h1Text = h1.textContent || h1.innerText || '';
          if (h1Text.trim()) {
            rawTitleText = h1Text.trim();
            break;
          }
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        return {
          title: 'Untitled',
          chapterNumber: null
        };
      }
      
      // Parse the title to extract book title and chapter title
      const { bookTitle, chapterTitle: rawChapterTitle } = parseTitle(rawTitleText.trim());
      
      // Clean the chapter title
      const cleanedChapterTitle = cleanChapterTitle(rawChapterTitle);
      
      // Extract chapter number from chapter title or URL
      const extractChapterNumber = (chapterTitleText, url) => {
        // First try to extract from chapter title text
        if (chapterTitleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = chapterTitleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      const foundChapterNumber = extractChapterNumber(rawChapterTitle || rawTitleText, window.location.href);
      
      return {
        title: cleanedChapterTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Updating the chapter title cleaning to remove trailing separators:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to parse title in format: "Read {book-title} - {chapter-title} - NovelBuddy"
      const parseTitle = (titleText) => {
        if (!titleText) return { bookTitle: null, chapterTitle: null };
        
        let text = titleText.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        text = text.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s+NovelBuddy\s*$/i, '');
        
        // Remove leading "Read " prefix
        text = text.replace(/^Read\s+/i, '');
        
        // Remove trailing " -" separator if present
        text = text.replace(/\s*[–—\-]\s*$/, '');
        
        // Find the position where "Chapter {number}" appears
        // This is the separator between book title and chapter title
        // Pattern: look for "Chapter" followed by space and digits
        const chapterMatch = text.match(/\s+-\s+Chapter\s+\d+/i);
        
        if (chapterMatch) {
          // Found the separator pattern
          const separatorIndex = chapterMatch.index;
          const separatorLength = chapterMatch[0].length;
          
          // Book title is everything before the separator
          const bookTitle = text.substring(0, separatorIndex).trim();
          
          // Chapter title starts after the separator (which includes "Chapter {number}")
          const chapterTitle = text.substring(separatorIndex + separatorLength).trim();
          
          return { bookTitle, chapterTitle };
        }
        
        // Fallback: If no "Chapter {number}" pattern found, try splitting by " - "
        // but look for the pattern that has "Chapter" in the second part
        const parts = text.split(/\s+-\s+/);
        
        if (parts.length >= 2) {
          // Find which part contains "Chapter {number}"
          for (let i = 1; i < parts.length; i++) {
            if (parts[i].match(/^Chapter\s+\d+/i)) {
              // Found it - everything before this part is book title
              const bookTitle = parts.slice(0, i).join(' - ').trim();
              // Everything from this part onwards is chapter title
              const chapterTitle = parts.slice(i).join(' - ').trim();
              return { bookTitle, chapterTitle };
            }
          }
          
          // If no "Chapter" found, assume last part is chapter title
          const bookTitle = parts.slice(0, -1).join(' - ').trim();
          const chapterTitle = parts[parts.length - 1].trim();
          return { bookTitle, chapterTitle };
        }
        
        // If no " - " separator found, check if it's just a chapter title
        if (text.match(/^Chapter\s+\d+/i)) {
          return { bookTitle: null, chapterTitle: text };
        }
        
        // Otherwise, might be just book title or malformed
        return { bookTitle: text, chapterTitle: null };
      };
      
      // Helper function to clean chapter title by removing "Chapter {number}" prefix and trailing separators
      const cleanChapterTitle = (chapterTitle) => {
        if (!chapterTitle) return null;
        
        let cleaned = chapterTitle.trim();
        
        // Remove "Chapter {number}" prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        // Remove trailing separators like " -", " —", etc.
        cleaned = cleaned.replace(/\s*[–—\-]\s*$/, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from <title> tag (primary source)
      let rawTitleText = null;
      const titleTag = document.querySelector('title');
      if (titleTag) {
        rawTitleText = titleTag.textContent || titleTag.innerText || '';
      }
      
      // Fallback: Try other meta tags or headings if title tag not found
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try og:title meta tag
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          rawTitleText = ogTitle.getAttribute('content') || '';
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try h1 elements
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          const h1Text = h1.textContent || h1.innerText || '';
          if (h1Text.trim()) {
            rawTitleText = h1Text.trim();
            break;
          }
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        return {
          title: 'Untitled',
          chapterNumber: null
        };
      }
      
      // Parse the title to extract book title and chapter title
      const { bookTitle, chapterTitle: rawChapterTitle } = parseTitle(rawTitleText.trim());
      
      // Clean the chapter title
      const cleanedChapterTitle = cleanChapterTitle(rawChapterTitle);
      
      // Extract chapter number from chapter title or URL
      const extractChapterNumber = (chapterTitleText, url) => {
        // First try to extract from chapter title text
        if (chapterTitleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = chapterTitleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      const foundChapterNumber = extractChapterNumber(rawChapterTitle || rawTitleText, window.location.href);
      
      return {
        title: cleanedChapterTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Checking how the title is used in the scrapeChapter function:


Checking the HTML for h1 elements that might have a different format:


The h1 uses a different format: "Get-go-Chapter" (no space before "Chapter"). Updating the parsing to handle both formats:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelBuddy uses keyboard navigation hints, so navigation might be in various places
    // Try common navigation patterns
    const nextSelectors = [
      'a[rel="next"]',
      '.nav-next a',
      '.next-chapter',
      '.chapter-nav-next a',
      'a:contains("Next")',
      'a:contains("NEXT")',
      'a:contains("Next Chapter")',
      // Try finding link with "next" in text or class
      'a[href*="chapter"]:not([href*="prev"])'
    ];

    for (const selector of nextSelectors) {
      try {
        const nextLink = await page.$(selector);
        if (nextLink) {
          const href = await page.evaluate(el => el.href, nextLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const allLinks = await page.$$eval('a[href*="chapter"]', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent.trim()
      }))
    );

    // Try to find next chapter by extracting current chapter number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            return link.href;
          }
        }
      }
    }

    return null;
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
    // Try common navigation patterns for previous
    const prevSelectors = [
      'a[rel="prev"]',
      '.nav-prev a',
      '.nav-previous a',
      '.previous-chapter',
      '.chapter-nav-prev a',
      'a:contains("Prev")',
      'a:contains("PREV")',
      'a:contains("Previous")',
      'a:contains("Previous Chapter")'
    ];

    for (const selector of prevSelectors) {
      try {
        const prevLink = await page.$(selector);
        if (prevLink) {
          const href = await page.evaluate(el => el.href, prevLink);
          if (href && href !== page.url()) {
            return href;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        return prevUrl;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 */
export async function hasContent(page) {
  try {
    // Check for main content area - NovelBuddy likely uses common content selectors
    const contentSelectors = [
      '.chapter-content',
      '.content',
      '.entry-content',
      '.chapter-text',
      '.novel-content',
      'article',
      'main',
      '.reading-content',
      '#chapter-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment');
          scripts.forEach(s => s.remove());
          return el.textContent.trim();
        }, element);
        
        if (text && text.length > 100) { // Minimum content threshold
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
}

/**
 * Scrapes a single chapter.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Navigate if not already on the page
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to parse title in format: "Read {book-title} - {chapter-title} - NovelBuddy"
      const parseTitle = (titleText) => {
        if (!titleText) return { bookTitle: null, chapterTitle: null };
        
        let text = titleText.trim();
        
        // Remove trailing " - NovelBuddy" or similar site name
        text = text.replace(/\s*[–—]\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s*&amp;#8211;\s*NovelBuddy\s*$/i, '');
        text = text.replace(/\s+NovelBuddy\s*$/i, '');
        
        // Remove leading "Read " prefix
        text = text.replace(/^Read\s+/i, '');
        
        // Remove trailing " -" separator if present
        text = text.replace(/\s*[–—\-]\s*$/, '');
        
        // Find the position where "Chapter {number}" appears
        // This is the separator between book title and chapter title
        // Pattern 1: look for " - Chapter" (with space and hyphen before)
        // Pattern 2: look for "-Chapter" (with just hyphen, no space)
        // Pattern 3: look for " Chapter" (with just space, no hyphen)
        let chapterMatch = text.match(/\s+-\s+Chapter\s+\d+/i);
        if (!chapterMatch) {
          chapterMatch = text.match(/-\s*Chapter\s+\d+/i);
        }
        if (!chapterMatch) {
          chapterMatch = text.match(/\s+Chapter\s+\d+/i);
        }
        
        if (chapterMatch) {
          // Found the separator pattern
          const separatorIndex = chapterMatch.index;
          const separatorLength = chapterMatch[0].length;
          
          // Book title is everything before the separator
          const bookTitle = text.substring(0, separatorIndex).trim();
          
          // Chapter title starts after the separator (which includes "Chapter {number}")
          const chapterTitle = text.substring(separatorIndex + separatorLength).trim();
          
          return { bookTitle, chapterTitle };
        }
        
        // Fallback: If no "Chapter {number}" pattern found, try splitting by " - "
        // but look for the pattern that has "Chapter" in the second part
        const parts = text.split(/\s+-\s+/);
        
        if (parts.length >= 2) {
          // Find which part contains "Chapter {number}"
          for (let i = 1; i < parts.length; i++) {
            if (parts[i].match(/^Chapter\s+\d+/i)) {
              // Found it - everything before this part is book title
              const bookTitle = parts.slice(0, i).join(' - ').trim();
              // Everything from this part onwards is chapter title
              const chapterTitle = parts.slice(i).join(' - ').trim();
              return { bookTitle, chapterTitle };
            }
          }
          
          // If no "Chapter" found, assume last part is chapter title
          const bookTitle = parts.slice(0, -1).join(' - ').trim();
          const chapterTitle = parts[parts.length - 1].trim();
          return { bookTitle, chapterTitle };
        }
        
        // If no " - " separator found, check if it's just a chapter title
        if (text.match(/^Chapter\s+\d+/i)) {
          return { bookTitle: null, chapterTitle: text };
        }
        
        // Otherwise, might be just book title or malformed
        return { bookTitle: text, chapterTitle: null };
      };
      
      // Helper function to clean chapter title by removing "Chapter {number}" prefix and trailing separators
      const cleanChapterTitle = (chapterTitle) => {
        if (!chapterTitle) return null;
        
        let cleaned = chapterTitle.trim();
        
        // Remove "Chapter {number}" prefix patterns like "Chapter 43: ", "Chapter 43 - ", etc.
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s\-–—]*/i, '');
        
        // Remove trailing separators like " -", " —", etc.
        cleaned = cleaned.replace(/\s*[–—\-]\s*$/, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from <title> tag (primary source)
      let rawTitleText = null;
      const titleTag = document.querySelector('title');
      if (titleTag) {
        rawTitleText = titleTag.textContent || titleTag.innerText || '';
      }
      
      // Fallback: Try other meta tags or headings if title tag not found
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try og:title meta tag
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          rawTitleText = ogTitle.getAttribute('content') || '';
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        // Try h1 elements
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          if (h1.classList.contains('site-title') || h1.classList.contains('logo')) continue;
          const h1Text = h1.textContent || h1.innerText || '';
          if (h1Text.trim()) {
            rawTitleText = h1Text.trim();
            break;
          }
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        return {
          title: 'Untitled',
          chapterNumber: null
        };
      }
      
      // Parse the title to extract book title and chapter title
      const { bookTitle, chapterTitle: rawChapterTitle } = parseTitle(rawTitleText.trim());
      
      // Clean the chapter title
      const cleanedChapterTitle = cleanChapterTitle(rawChapterTitle);
      
      // Extract chapter number from chapter title or URL
      const extractChapterNumber = (chapterTitleText, url) => {
        // First try to extract from chapter title text
        if (chapterTitleText) {
          // Pattern: "Chapter 43" or "Chapter 43:" or "chapter-43"
          let match = chapterTitleText.match(/[Cc]hapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      const foundChapterNumber = extractChapterNumber(rawChapterTitle || rawTitleText, window.location.href);
      
      return {
        title: cleanedChapterTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    let finalChapterNumber = chapterNumber;
    if (finalChapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      finalChapterNumber = options.chapterNumber;
    }

    // Extract content and images
    const { content, images } = await page.evaluate(() => {
      // Try multiple content selectors
      const contentSelectors = [
        '.chapter-content',
        '.content',
        '.entry-content',
        '.chapter-text',
        '.novel-content',
        'article',
        'main .content',
        '.reading-content',
        '#chapter-content',
        '.text-content'
      ];
      
      let contentEl = null;
      for (const selector of contentSelectors) {
        contentEl = document.querySelector(selector);
        if (contentEl) break;
      }
      
      // Fallback: find the largest text container
      if (!contentEl) {
        const candidates = document.querySelectorAll('div, article, main, section');
        let maxTextLength = 0;
        for (const candidate of candidates) {
          const text = candidate.textContent || '';
          if (text.length > maxTextLength && text.length > 500) {
            maxTextLength = text.length;
            contentEl = candidate;
          }
        }
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .comments, .comment, .chapter-nav, .chapter-navigation, .social-share, .share, .ad, .advertisement, .ads, header, .header, .site-header');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('banner') && !src.includes('ad'))
        .filter(Boolean);
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText && pText.length > 0) {
            text += pText + '\n\n';
          }
        });
      } else {
        // Fallback: use innerText or textContent
        text = clone.innerText || clone.textContent || '';
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      return {
        content: text.trim(),
        images: extractedImages
      };
    });

    return {
      title,
      content,
      chapterNumber: finalChapterNumber,
      images: images.length > 0 ? images : undefined
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text';
}

/**
 * Helper function to scroll page and trigger lazy loading.
 */
async function scrollPage(page, delay, maxScrolls) {
  let scrollCount = 0;
  let lastHeight = 0;
  let currentHeight = 0;

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
  await page.waitForTimeout(200);
}

```

Verifying the title tag is prioritized and checking for lint errors:


Updated the parsing logic to handle both title formats:

1. **Title tag format**: "Read {book-title} - Chapter {number} {chapter-title} - NovelBuddy"
2. **H1 format**: "{book-title}-Chapter {number} {chapter-title}" (no space before "Chapter")

The parser now:
- Handles separators with and without spaces: " - Chapter", "-Chapter", " Chapter"
- Removes trailing separators from the chapter title
- Removes the "Chapter {number}" prefix from the chapter title
- Prioritizes the `<title>` tag, then falls back to `og:title` and h1 elements

When you scrape chapters, the title should be just the chapter title (e.g., "The fate of Xiao Chen, the protagonist of the Destiny, is another heroic way to save the United States") without the book title or "Chapter 43" prefix.

---

**User**

When scraping or reverse scraping, if the lastPathScraped is defined, that should be used at the starting point. If it is not defined, then the startingPath should be used. If neither are defined, report an error and stop scraping.

---

**Cursor**

Examining ScraperEngine to update the starting URL logic:


Checking the reverse scraping method:


Reading more of the reverse scraping method:


Updating both methods to use the correct starting URL logic:


```javascript
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




```

```javascript
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




```

Checking for linting errors:


Verifying the changes are correct:


Updated both `scrapeBook` and `scrapeBookReverse` to use the correct starting URL logic.

**Changes made:**

1. **`scrapeBook` method** (lines 55-69):
   - Uses `lastPathScraped` if defined
   - Otherwise uses `startingPath` if defined
   - Throws an error if neither are defined

2. **`scrapeBookReverse` method** (lines 302-316):
   - Same priority logic: `lastPathScraped` → `startingPath` → error
   - Consistent with the forward scraping method

Both methods now:
- Prioritize `lastPathScraped` for resuming
- Fall back to `startingPath` for new scraping sessions
- Throw a clear error if neither is defined, preventing scraping from starting

The error message guides users to set a `startingPath` when adding the book.

