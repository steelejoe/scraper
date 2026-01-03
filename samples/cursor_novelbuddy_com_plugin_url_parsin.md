# Novelbuddy.com plugin URL parsing
_Exported on 1/3/2026 at 10:38:05 PST from Cursor (2.3.15)_

---

**User**

The @src/plugins/novelbuddy.com.js  plugin does not seem to be parsing the next and previous URLs correctly from the chapter content. Please review the @samples/novelbuddy.com_novel_mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go_chapter-43-the-fate-of-xiao-chen-the-protagonist-of-the-destiny-is-another-heroic-way-to-save-the-united-states.html  sample and look for the "Previous chapter" and "Next chapter" entities to find these URLs. Then update the plugin to return them correctly

---

**Cursor**

Examining the HTML sample to identify how the Previous and Next chapter links are structured.


Searching for "Previous chapter" and "Next chapter" in the HTML:


Reading the sections around the navigation buttons to understand their structure:


Found the navigation structure. The HTML has:
1. Elements with `id="btn-prev"` and `id="btn-next"` with `title="Previous chapter"` and `title="Next chapter"`.
2. Links with `title="Previous chapter"` and `title="Next chapter"`.

Updating the plugin to use these selectors:


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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-next" and title="Next chapter"
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnNext = document.getElementById('btn-next');
      if (btnNext && btnNext.href && btnNext.getAttribute('title') === 'Next chapter') {
        return btnNext.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Next chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="next"]',
        '.nav-next a',
        '.next-chapter',
        '.chapter-nav-next a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (nextLink) {
      return nextLink;
    }

    // Final fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      const allLinks = await page.$$eval('a[href*="chapter"]', links => 
        links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
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
    // Check for main content area - NovelBuddy uses .content-inner as the main content container
    const contentSelectors = [
      '.content-inner',
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
      // Note: NovelBuddy uses .content-inner as the main content container
      const contentSelectors = [
        '.content-inner',
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
        const elements = document.querySelectorAll(selector);
        // For NovelBuddy, prefer .content-inner if it exists and has substantial content
        if (selector === '.content-inner' && elements.length > 0) {
          for (const el of elements) {
            const text = el.textContent || '';
            // Check if it has substantial content (more than just navigation/copyright)
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        } else if (elements.length > 0) {
          // For other selectors, check if they have substantial content
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        }
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
      
      // Filter patterns for unwanted content
      const unwantedPatterns = [
        /^©NovelBuddy$/i,
        /^←\s*Previous\s+Chapter/i,
        /^Next\s+Chapter\s+→/i,
        /^Previous\s+Chapter.*Next\s+Chapter/i,
        /Please click PLAY button to read/i,
        /If audio player doesn't work/i
      ];
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          // Skip empty paragraphs
          if (!pText || pText.length === 0) {
            return;
          }
          
          // Skip paragraphs that match unwanted patterns
          const isUnwanted = unwantedPatterns.some(pattern => pattern.test(pText));
          if (isUnwanted) {
            return;
          }
          
          // Skip very short paragraphs that are likely navigation or metadata
          // (but allow single character paragraphs that might be intentional formatting)
          if (pText.length < 3 && !/^[^\w\s]$/.test(pText)) {
            return;
          }
          
          text += pText + '\n\n';
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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-next" and title="Next chapter"
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnNext = document.getElementById('btn-next');
      if (btnNext && btnNext.href && btnNext.getAttribute('title') === 'Next chapter') {
        return btnNext.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Next chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="next"]',
        '.nav-next a',
        '.next-chapter',
        '.chapter-nav-next a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (nextLink) {
      return nextLink;
    }

    // Final fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      const allLinks = await page.$$eval('a[href*="chapter"]', links => 
        links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-prev" and title="Previous chapter"
    const prevLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev && btnPrev.href && btnPrev.getAttribute('title') === 'Previous chapter') {
        return btnPrev.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Previous chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="prev"]',
        '.nav-prev a',
        '.nav-previous a',
        '.previous-chapter',
        '.chapter-nav-prev a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (prevLink) {
      return prevLink;
    }

    // Final fallback: Look for previous chapter by number
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
    // Check for main content area - NovelBuddy uses .content-inner as the main content container
    const contentSelectors = [
      '.content-inner',
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
      // Note: NovelBuddy uses .content-inner as the main content container
      const contentSelectors = [
        '.content-inner',
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
        const elements = document.querySelectorAll(selector);
        // For NovelBuddy, prefer .content-inner if it exists and has substantial content
        if (selector === '.content-inner' && elements.length > 0) {
          for (const el of elements) {
            const text = el.textContent || '';
            // Check if it has substantial content (more than just navigation/copyright)
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        } else if (elements.length > 0) {
          // For other selectors, check if they have substantial content
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        }
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
      
      // Filter patterns for unwanted content
      const unwantedPatterns = [
        /^©NovelBuddy$/i,
        /^←\s*Previous\s+Chapter/i,
        /^Next\s+Chapter\s+→/i,
        /^Previous\s+Chapter.*Next\s+Chapter/i,
        /Please click PLAY button to read/i,
        /If audio player doesn't work/i
      ];
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          // Skip empty paragraphs
          if (!pText || pText.length === 0) {
            return;
          }
          
          // Skip paragraphs that match unwanted patterns
          const isUnwanted = unwantedPatterns.some(pattern => pattern.test(pText));
          if (isUnwanted) {
            return;
          }
          
          // Skip very short paragraphs that are likely navigation or metadata
          // (but allow single character paragraphs that might be intentional formatting)
          if (pText.length < 3 && !/^[^\w\s]$/.test(pText)) {
            return;
          }
          
          text += pText + '\n\n';
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


Updated the plugin to correctly parse the Previous and Next chapter URLs. Changes:

1. **`getNextChapterUrl`**: Now checks:
   - `#btn-next` with `title="Next chapter"`
   - `a[title="Next chapter"]`
   - Falls back to other common patterns if needed

2. **`getPreviousChapterUrl`**: Now checks:
   - `#btn-prev` with `title="Previous chapter"`
   - `a[title="Previous chapter"]`
   - Falls back to other common patterns if needed

Both functions use `page.evaluate()` to run in the browser context, which is more reliable for accessing DOM elements and attributes. They prioritize the specific IDs and title attributes found in the NovelBuddy HTML, then fall back to other patterns if those aren't found.

The plugin should now correctly extract the Previous and Next chapter URLs from NovelBuddy pages.

---

**User**

When there are errors with the previous or next URLs (e.g. they do not mach the root path) please report the errors to the console.

---

**Cursor**

Adding console error reporting for invalid previous/next URLs. Checking how root paths are validated in the codebase:


Checking how these functions are called in ScraperEngine to see if we can pass the root path:


Checking the plugin interface to see if we can pass the root path or options:


Updating the plugin to accept an optional `options` parameter with `rootPath` and log errors when URLs don't match. This matches the pattern used in `scrapeChapter`.


Updating both functions to accept an optional `options` parameter, validate URLs against the root path, and log errors:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Optional parameters
 * @param {string} options.rootPath - Root path to validate URLs against
 */
export async function getNextChapterUrl(page, options = {}) {
  try {
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-next" and title="Next chapter"
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnNext = document.getElementById('btn-next');
      if (btnNext && btnNext.href && btnNext.getAttribute('title') === 'Next chapter') {
        return btnNext.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Next chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="next"]',
        '.nav-next a',
        '.next-chapter',
        '.chapter-nav-next a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (nextLink) {
      // Validate URL if rootPath is provided
      if (options.rootPath) {
        const validationError = validateUrl(nextLink, page.url(), options.rootPath, 'next');
        if (validationError) {
          console.error(validationError);
          return null;
        }
      }
      return nextLink;
    }

    // Final fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      const allLinks = await page.$$eval('a[href*="chapter"]', links => 
        links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            // Validate URL if rootPath is provided
            if (options.rootPath) {
              const validationError = validateUrl(link.href, currentUrl, options.rootPath, 'next');
              if (validationError) {
                console.error(validationError);
                continue; // Try next link
              }
            }
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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-prev" and title="Previous chapter"
    const prevLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev && btnPrev.href && btnPrev.getAttribute('title') === 'Previous chapter') {
        return btnPrev.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Previous chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="prev"]',
        '.nav-prev a',
        '.nav-previous a',
        '.previous-chapter',
        '.chapter-nav-prev a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (prevLink) {
      return prevLink;
    }

    // Final fallback: Look for previous chapter by number
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
    // Check for main content area - NovelBuddy uses .content-inner as the main content container
    const contentSelectors = [
      '.content-inner',
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
      // Note: NovelBuddy uses .content-inner as the main content container
      const contentSelectors = [
        '.content-inner',
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
        const elements = document.querySelectorAll(selector);
        // For NovelBuddy, prefer .content-inner if it exists and has substantial content
        if (selector === '.content-inner' && elements.length > 0) {
          for (const el of elements) {
            const text = el.textContent || '';
            // Check if it has substantial content (more than just navigation/copyright)
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        } else if (elements.length > 0) {
          // For other selectors, check if they have substantial content
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        }
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
      
      // Filter patterns for unwanted content
      const unwantedPatterns = [
        /^©NovelBuddy$/i,
        /^←\s*Previous\s+Chapter/i,
        /^Next\s+Chapter\s+→/i,
        /^Previous\s+Chapter.*Next\s+Chapter/i,
        /Please click PLAY button to read/i,
        /If audio player doesn't work/i
      ];
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          // Skip empty paragraphs
          if (!pText || pText.length === 0) {
            return;
          }
          
          // Skip paragraphs that match unwanted patterns
          const isUnwanted = unwantedPatterns.some(pattern => pattern.test(pText));
          if (isUnwanted) {
            return;
          }
          
          // Skip very short paragraphs that are likely navigation or metadata
          // (but allow single character paragraphs that might be intentional formatting)
          if (pText.length < 3 && !/^[^\w\s]$/.test(pText)) {
            return;
          }
          
          text += pText + '\n\n';
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

```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Optional parameters
 * @param {string} options.rootPath - Root path to validate URLs against
 */
export async function getNextChapterUrl(page, options = {}) {
  try {
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-next" and title="Next chapter"
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnNext = document.getElementById('btn-next');
      if (btnNext && btnNext.href && btnNext.getAttribute('title') === 'Next chapter') {
        return btnNext.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Next chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="next"]',
        '.nav-next a',
        '.next-chapter',
        '.chapter-nav-next a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (nextLink) {
      // Validate URL if rootPath is provided
      if (options.rootPath) {
        const validationError = validateUrl(nextLink, page.url(), options.rootPath, 'next');
        if (validationError) {
          console.error(validationError);
          return null;
        }
      }
      return nextLink;
    }

    // Final fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      const allLinks = await page.$$eval('a[href*="chapter"]', links => 
        links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            // Validate URL if rootPath is provided
            if (options.rootPath) {
              const validationError = validateUrl(link.href, currentUrl, options.rootPath, 'next');
              if (validationError) {
                console.error(validationError);
                continue; // Try next link
              }
            }
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
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Optional parameters
 * @param {string} options.rootPath - Root path to validate URLs against
 */
export async function getPreviousChapterUrl(page, options = {}) {
  try {
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-prev" and title="Previous chapter"
    const prevLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev && btnPrev.href && btnPrev.getAttribute('title') === 'Previous chapter') {
        return btnPrev.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Previous chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="prev"]',
        '.nav-prev a',
        '.nav-previous a',
        '.previous-chapter',
        '.chapter-nav-prev a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (prevLink) {
      // Validate URL if rootPath is provided
      if (options.rootPath) {
        const validationError = validateUrl(prevLink, page.url(), options.rootPath, 'previous');
        if (validationError) {
          console.error(validationError);
          return null;
        }
      }
      return prevLink;
    }

    // Final fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        
        // Validate URL if rootPath is provided
        if (options.rootPath) {
          const validationError = validateUrl(prevUrl, currentUrl, options.rootPath, 'previous');
          if (validationError) {
            console.error(validationError);
            return null;
          }
        }
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
    // Check for main content area - NovelBuddy uses .content-inner as the main content container
    const contentSelectors = [
      '.content-inner',
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
      // Note: NovelBuddy uses .content-inner as the main content container
      const contentSelectors = [
        '.content-inner',
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
        const elements = document.querySelectorAll(selector);
        // For NovelBuddy, prefer .content-inner if it exists and has substantial content
        if (selector === '.content-inner' && elements.length > 0) {
          for (const el of elements) {
            const text = el.textContent || '';
            // Check if it has substantial content (more than just navigation/copyright)
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        } else if (elements.length > 0) {
          // For other selectors, check if they have substantial content
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        }
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
      
      // Filter patterns for unwanted content
      const unwantedPatterns = [
        /^©NovelBuddy$/i,
        /^←\s*Previous\s+Chapter/i,
        /^Next\s+Chapter\s+→/i,
        /^Previous\s+Chapter.*Next\s+Chapter/i,
        /Please click PLAY button to read/i,
        /If audio player doesn't work/i
      ];
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          // Skip empty paragraphs
          if (!pText || pText.length === 0) {
            return;
          }
          
          // Skip paragraphs that match unwanted patterns
          const isUnwanted = unwantedPatterns.some(pattern => pattern.test(pText));
          if (isUnwanted) {
            return;
          }
          
          // Skip very short paragraphs that are likely navigation or metadata
          // (but allow single character paragraphs that might be intentional formatting)
          if (pText.length < 3 && !/^[^\w\s]$/.test(pText)) {
            return;
          }
          
          text += pText + '\n\n';
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

Adding a helper function to validate URLs against the root path:


```javascript
/**
 * Plugin for novelbuddy.com
 * 
 * This plugin scrapes chapter content from NovelBuddy.com.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Validates a URL against the root path and current page domain.
 * @param {string} url - URL to validate
 * @param {string} currentUrl - Current page URL
 * @param {string} rootPath - Root path that the URL should contain
 * @param {string} direction - 'next' or 'previous' for error messages
 * @returns {string|null} Error message if validation fails, null if valid
 */
function validateUrl(url, currentUrl, rootPath, direction) {
  try {
    // Parse both URLs
    const urlObj = new URL(url);
    const currentUrlObj = new URL(currentUrl);
    
    // Check if URLs are from the same domain
    if (urlObj.hostname !== currentUrlObj.hostname) {
      return `Error: ${direction} chapter URL is from a different domain. Expected: ${currentUrlObj.hostname}, got: ${urlObj.hostname}`;
    }
    
    // Extract path from URL
    const urlPath = urlObj.pathname + urlObj.search;
    
    // Check if URL path contains the root path
    if (!urlPath.includes(rootPath)) {
      return `Error: ${direction} chapter URL path does not contain root path "${rootPath}". URL path: ${urlPath}`;
    }
    
    return null; // URL is valid
  } catch (error) {
    return `Error: Invalid ${direction} chapter URL format: ${url}. ${error.message}`;
  }
}

/**
 * Extracts the "next chapter" URL from the current page.
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Optional parameters
 * @param {string} options.rootPath - Root path to validate URLs against
 */
export async function getNextChapterUrl(page, options = {}) {
  try {
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-next" and title="Next chapter"
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnNext = document.getElementById('btn-next');
      if (btnNext && btnNext.href && btnNext.getAttribute('title') === 'Next chapter') {
        return btnNext.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Next chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="next"]',
        '.nav-next a',
        '.next-chapter',
        '.chapter-nav-next a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (nextLink) {
      // Validate URL if rootPath is provided
      if (options.rootPath) {
        const validationError = validateUrl(nextLink, page.url(), options.rootPath, 'next');
        if (validationError) {
          console.error(validationError);
          return null;
        }
      }
      return nextLink;
    }

    // Final fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      const allLinks = await page.$$eval('a[href*="chapter"]', links => 
        links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            // Validate URL if rootPath is provided
            if (options.rootPath) {
              const validationError = validateUrl(link.href, currentUrl, options.rootPath, 'next');
              if (validationError) {
                console.error(validationError);
                continue; // Try next link
              }
            }
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
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Optional parameters
 * @param {string} options.rootPath - Root path to validate URLs against
 */
export async function getPreviousChapterUrl(page, options = {}) {
  try {
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-prev" and title="Previous chapter"
    const prevLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev && btnPrev.href && btnPrev.getAttribute('title') === 'Previous chapter') {
        return btnPrev.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Previous chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="prev"]',
        '.nav-prev a',
        '.nav-previous a',
        '.previous-chapter',
        '.chapter-nav-prev a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (prevLink) {
      // Validate URL if rootPath is provided
      if (options.rootPath) {
        const validationError = validateUrl(prevLink, page.url(), options.rootPath, 'previous');
        if (validationError) {
          console.error(validationError);
          return null;
        }
      }
      return prevLink;
    }

    // Final fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        
        // Validate URL if rootPath is provided
        if (options.rootPath) {
          const validationError = validateUrl(prevUrl, currentUrl, options.rootPath, 'previous');
          if (validationError) {
            console.error(validationError);
            return null;
          }
        }
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
    // Check for main content area - NovelBuddy uses .content-inner as the main content container
    const contentSelectors = [
      '.content-inner',
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
      // Note: NovelBuddy uses .content-inner as the main content container
      const contentSelectors = [
        '.content-inner',
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
        const elements = document.querySelectorAll(selector);
        // For NovelBuddy, prefer .content-inner if it exists and has substantial content
        if (selector === '.content-inner' && elements.length > 0) {
          for (const el of elements) {
            const text = el.textContent || '';
            // Check if it has substantial content (more than just navigation/copyright)
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        } else if (elements.length > 0) {
          // For other selectors, check if they have substantial content
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        }
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
      
      // Filter patterns for unwanted content
      const unwantedPatterns = [
        /^©NovelBuddy$/i,
        /^←\s*Previous\s+Chapter/i,
        /^Next\s+Chapter\s+→/i,
        /^Previous\s+Chapter.*Next\s+Chapter/i,
        /Please click PLAY button to read/i,
        /If audio player doesn't work/i
      ];
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          // Skip empty paragraphs
          if (!pText || pText.length === 0) {
            return;
          }
          
          // Skip paragraphs that match unwanted patterns
          const isUnwanted = unwantedPatterns.some(pattern => pattern.test(pText));
          if (isUnwanted) {
            return;
          }
          
          // Skip very short paragraphs that are likely navigation or metadata
          // (but allow single character paragraphs that might be intentional formatting)
          if (pText.length < 3 && !/^[^\w\s]$/.test(pText)) {
            return;
          }
          
          text += pText + '\n\n';
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

Checking if ScraperEngine needs updates to pass `rootPath` in options:


Updating ScraperEngine to pass `rootPath` in options so the plugin can validate and report errors. Finding all call sites:


Updating all call sites in ScraperEngine to pass `rootPath` in options:


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
            const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
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
            const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
          
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
            const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
          
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath }).catch(() => null);
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
            const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
          
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath }).catch(() => null);
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
            const prevUrl = await plugin.getPreviousChapterUrl(page, { rootPath: book.rootPath });
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
            const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
          
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath }).catch(() => null);
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
            const prevUrl = await plugin.getPreviousChapterUrl(page, { rootPath: book.rootPath });
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
          const prevUrl = await plugin.getPreviousChapterUrl(page, { rootPath: book.rootPath });
          
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
            const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath });
          
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
          const nextUrl = await plugin.getNextChapterUrl(page, { rootPath: book.rootPath }).catch(() => null);
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
            const prevUrl = await plugin.getPreviousChapterUrl(page, { rootPath: book.rootPath });
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
          const prevUrl = await plugin.getPreviousChapterUrl(page, { rootPath: book.rootPath });
          
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
          const prevUrl = await plugin.getPreviousChapterUrl(page, { rootPath: book.rootPath }).catch(() => null);
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




```

Checking for linting errors:


Verifying the changes by reading a portion of the updated plugin:


## Changes Made:

1. **Added a `validateUrl` helper function** that:
   - Validates URLs are from the same domain as the current page
   - Validates URLs contain the root path
   - Returns error messages for console logging

2. **Updated `getNextChapterUrl`** to:
   - Accept an optional `options` parameter with `rootPath`
   - Validate URLs when `rootPath` is provided
   - Log errors to the console when validation fails

3. **Updated `getPreviousChapterUrl`** to:
   - Accept an optional `options` parameter with `rootPath`
   - Validate URLs when `rootPath` is provided
   - Log errors to the console when validation fails

4. **Updated ScraperEngine** to:
   - Pass `{ rootPath: book.rootPath }` to all calls of `getNextChapterUrl` and `getPreviousChapterUrl`

When the plugin finds a next or previous chapter URL that doesn't match the root path or is from a different domain, it logs an error to the console and returns `null`, preventing invalid URLs from being used.

The error messages include:
- Domain mismatch errors
- Root path validation errors
- Invalid URL format errors

This provides early detection and reporting of navigation issues during scraping.

---

**User**

I want the @src/scraper/ScraperEngine.js  itself to detect and report errors where the next and/or previous URLs reported do not match the root path expected. The plugin should not need to change anything.

---

**Cursor**

Updating ScraperEngine to detect and report errors when next/previous URLs don't match the root path, without changing the plugin.


Updating ScraperEngine to add errors to the errors array when URL validation fails:


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




```

Checking for linting errors:


Verifying one of the changes:


Updated ScraperEngine to detect and report errors when next/previous URLs don't match the root path. Changes:

1. **All 6 validation points** now:
   - Log an error to the console with `console.error()`
   - Add the error to the `this.errors` array with type `'url_validation_error'`
   - Include the invalid URL and a descriptive message

2. **Error details captured**:
   - URL that failed validation
   - Error type: `'url_validation_error'`
   - Message explaining why it failed (includes the root path validation reason)

3. **Error reporting**: These errors are included in the error summary at the end of scraping via the existing `reportErrors()` method, grouped with other errors by type.

The plugin remains unchanged. ScraperEngine handles all validation and error reporting when URLs don't match the expected root path.

---

**User**

@bash (30-40) The scraping is reporting this error. However the root path does seem to match the previous URL passed. Why is this reporting an error?

---

**Cursor**

Checking the validation logic. The root path appears to be a full URL, but the validation compares it to the extracted pathname. Examining the code:


Checking the book entry to see what rootPath is stored:


The issue: `rootPath` is stored as a full URL (`https://novelbuddy.com/novel/mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go`), but `validateUrlContainsRootPath` compares it to the extracted pathname (e.g., `/novel/mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go/chapter-42-...`). Updating the validation to normalize `rootPath`: if it's a full URL, extract its pathname; otherwise use it as-is.


Updating the validation function to handle rootPath when it's a full URL:


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

Checking for linting errors:


Verifying the fix handles both URL and path formats. Checking other books to see how rootPath is stored:


The fix handles both cases:

1. **If rootPath is a full URL** (like `https://novelbuddy.com/novel/...`): extracts the pathname (`/novel/...`)
2. **If rootPath is already a path** (like `/book/`): uses it as-is

The validation now:
- Normalizes the rootPath by extracting the pathname if it's a URL
- Removes trailing slashes from both paths for consistent comparison
- Checks if the URL path contains the normalized root path

This should resolve the false positive. The URL `/novel/mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go/chapter-42-...` will correctly match the root path `/novel/mtl-scoring-the-sacred-body-of-the-ancients-from-the-get-go` (extracted from the full URL).

The error message also shows the normalized root path for easier debugging.

---

**User**

Add an additional check to the @src/plugins/novelbuddy.com.js plugin getNextChapterUrl methods. If the next URL parsed matches the current URL, then return null or undefined from the method. Do the same for the getPreviousChapterUrl method.

---

**Cursor**

Adding checks to both methods to return null if the extracted URL matches the current URL:


Updating both methods to add explicit checks comparing the extracted URL with the current page URL:


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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-next" and title="Next chapter"
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnNext = document.getElementById('btn-next');
      if (btnNext && btnNext.href && btnNext.getAttribute('title') === 'Next chapter') {
        return btnNext.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Next chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="next"]',
        '.nav-next a',
        '.next-chapter',
        '.chapter-nav-next a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (nextLink) {
      // Check if the next URL matches the current URL (avoid infinite loops)
      const currentUrl = page.url();
      if (nextLink === currentUrl || nextLink === currentUrl.split('#')[0]) {
        return null;
      }
      return nextLink;
    }

    // Final fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      const allLinks = await page.$$eval('a[href*="chapter"]', links => 
        links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            // Check if the link URL matches the current URL (avoid infinite loops)
            if (link.href === currentUrl || link.href === currentUrl.split('#')[0]) {
              return null;
            }
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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-prev" and title="Previous chapter"
    const prevLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev && btnPrev.href && btnPrev.getAttribute('title') === 'Previous chapter') {
        return btnPrev.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Previous chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="prev"]',
        '.nav-prev a',
        '.nav-previous a',
        '.previous-chapter',
        '.chapter-nav-prev a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (prevLink) {
      return prevLink;
    }

    // Final fallback: Look for previous chapter by number
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
    // Check for main content area - NovelBuddy uses .content-inner as the main content container
    const contentSelectors = [
      '.content-inner',
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
      // Note: NovelBuddy uses .content-inner as the main content container
      const contentSelectors = [
        '.content-inner',
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
        const elements = document.querySelectorAll(selector);
        // For NovelBuddy, prefer .content-inner if it exists and has substantial content
        if (selector === '.content-inner' && elements.length > 0) {
          for (const el of elements) {
            const text = el.textContent || '';
            // Check if it has substantial content (more than just navigation/copyright)
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        } else if (elements.length > 0) {
          // For other selectors, check if they have substantial content
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        }
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
      
      // Filter patterns for unwanted content
      const unwantedPatterns = [
        /^©NovelBuddy$/i,
        /^←\s*Previous\s+Chapter/i,
        /^Next\s+Chapter\s+→/i,
        /^Previous\s+Chapter.*Next\s+Chapter/i,
        /Please click PLAY button to read/i,
        /If audio player doesn't work/i
      ];
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          // Skip empty paragraphs
          if (!pText || pText.length === 0) {
            return;
          }
          
          // Skip paragraphs that match unwanted patterns
          const isUnwanted = unwantedPatterns.some(pattern => pattern.test(pText));
          if (isUnwanted) {
            return;
          }
          
          // Skip very short paragraphs that are likely navigation or metadata
          // (but allow single character paragraphs that might be intentional formatting)
          if (pText.length < 3 && !/^[^\w\s]$/.test(pText)) {
            return;
          }
          
          text += pText + '\n\n';
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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-next" and title="Next chapter"
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnNext = document.getElementById('btn-next');
      if (btnNext && btnNext.href && btnNext.getAttribute('title') === 'Next chapter') {
        return btnNext.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Next chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="next"]',
        '.nav-next a',
        '.next-chapter',
        '.chapter-nav-next a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (nextLink) {
      // Check if the next URL matches the current URL (avoid infinite loops)
      const currentUrl = page.url();
      if (nextLink === currentUrl || nextLink === currentUrl.split('#')[0]) {
        return null;
      }
      return nextLink;
    }

    // Final fallback: Look for any link that might be a next chapter link
    // Check for links containing "chapter" and a number higher than current
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      const allLinks = await page.$$eval('a[href*="chapter"]', links => 
        links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        }))
      );
      
      for (const link of allLinks) {
        const linkMatch = link.href.match(/chapter-(\d+)/i);
        if (linkMatch) {
          const linkChapter = parseInt(linkMatch[1], 10);
          if (linkChapter === currentChapter + 1) {
            // Check if the link URL matches the current URL (avoid infinite loops)
            if (link.href === currentUrl || link.href === currentUrl.split('#')[0]) {
              return null;
            }
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
    // NovelBuddy uses specific IDs and title attributes for navigation
    // Primary: Look for element with id="btn-prev" and title="Previous chapter"
    const prevLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev && btnPrev.href && btnPrev.getAttribute('title') === 'Previous chapter') {
        return btnPrev.href;
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Previous chapter"]');
      for (const link of linksByTitle) {
        if (link.href && link.href !== window.location.href) {
          return link.href;
        }
      }
      
      // Fallback: Try other common patterns
      const fallbackSelectors = [
        'a[rel="prev"]',
        '.nav-prev a',
        '.nav-previous a',
        '.previous-chapter',
        '.chapter-nav-prev a'
      ];
      
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.href && element.href !== window.location.href) {
          return element.href;
        }
      }
      
      return null;
    });

    if (prevLink) {
      // Check if the previous URL matches the current URL (avoid infinite loops)
      const currentUrl = page.url();
      if (prevLink === currentUrl || prevLink === currentUrl.split('#')[0]) {
        return null;
      }
      return prevLink;
    }

    // Final fallback: Look for previous chapter by number
    const currentUrl = page.url();
    const currentMatch = currentUrl.match(/chapter-(\d+)/i);
    if (currentMatch) {
      const currentChapter = parseInt(currentMatch[1], 10);
      if (currentChapter > 1) {
        const prevChapter = currentChapter - 1;
        // Try to construct previous URL
        const prevUrl = currentUrl.replace(/chapter-\d+/i, `chapter-${prevChapter}`);
        // Check if the constructed URL matches the current URL (avoid infinite loops)
        if (prevUrl === currentUrl || prevUrl === currentUrl.split('#')[0]) {
          return null;
        }
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
    // Check for main content area - NovelBuddy uses .content-inner as the main content container
    const contentSelectors = [
      '.content-inner',
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
      // Note: NovelBuddy uses .content-inner as the main content container
      const contentSelectors = [
        '.content-inner',
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
        const elements = document.querySelectorAll(selector);
        // For NovelBuddy, prefer .content-inner if it exists and has substantial content
        if (selector === '.content-inner' && elements.length > 0) {
          for (const el of elements) {
            const text = el.textContent || '';
            // Check if it has substantial content (more than just navigation/copyright)
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        } else if (elements.length > 0) {
          // For other selectors, check if they have substantial content
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.length > 200) {
              contentEl = el;
              break;
            }
          }
          if (contentEl) break;
        }
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
      
      // Filter patterns for unwanted content
      const unwantedPatterns = [
        /^©NovelBuddy$/i,
        /^←\s*Previous\s+Chapter/i,
        /^Next\s+Chapter\s+→/i,
        /^Previous\s+Chapter.*Next\s+Chapter/i,
        /Please click PLAY button to read/i,
        /If audio player doesn't work/i
      ];
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          // Skip empty paragraphs
          if (!pText || pText.length === 0) {
            return;
          }
          
          // Skip paragraphs that match unwanted patterns
          const isUnwanted = unwantedPatterns.some(pattern => pattern.test(pText));
          if (isUnwanted) {
            return;
          }
          
          // Skip very short paragraphs that are likely navigation or metadata
          // (but allow single character paragraphs that might be intentional formatting)
          if (pText.length < 3 && !/^[^\w\s]$/.test(pText)) {
            return;
          }
          
          text += pText + '\n\n';
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


Added checks to both methods. Changes:

1. **`getNextChapterUrl`**:
   - After extracting `nextLink`, compares it with the current page URL
   - Returns `null` if they match (ignoring hash fragments)
   - In the fallback, also checks constructed URLs before returning

2. **`getPreviousChapterUrl`**:
   - After extracting `prevLink`, compares it with the current page URL
   - Returns `null` if they match (ignoring hash fragments)
   - In the fallback, also checks the constructed previous URL before returning

These checks prevent:
- Infinite loops when navigation links point to the same page
- Attempting to scrape the same URL repeatedly
- Getting stuck on pages where next/previous links are incorrectly set to the current page

The comparison ignores hash fragments (`#`) since they don't change the actual page content.

