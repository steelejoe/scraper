# NovelBuddy plugin content parsing
_Exported on 1/3/2026 at 10:37:52 PST from Cursor (2.3.15)_

---

**User**

The @src/plugins/novelbuddy.com.js  plugin does not seem to be parsing the content correctly. The only content I see in @content/sacred-body-of-the-ancients/novel_mtl_scoring_the_sacred_body_of_the_ancients_from_the_get_go_chapter_43_the_fate_of_xiao_chen_the_protagonist_of_the_destiny_is_another_heroic_way_to_save_the_united_states.md  is "©NovelBuddy". The actual content starts with "Jun Xiaoyao did not move on the surface, but he was a little surprised." Please update the content parsing to handle this.

---

**Cursor**

Examining the sample HTML to understand the page structure, then updating the plugin's content extraction.


Searching the HTML file for the actual content to understand its structure:


Reading a portion of the HTML file to understand its structure:


The HTML file appears to be in a code viewer format. Searching for the actual content structure:


Searching for the specific content mentioned by the user:


Searching for the actual HTML structure with the chapter content:


Content is in `<div class="content-inner">` with `<p>` tags. Checking the surrounding structure:


Checking the structure around `content-inner`:


Content is in `<div class="content-inner">` with `<p>` tags. Updating the plugin to use this selector:


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

Improving content extraction to better filter out unwanted elements like "©NovelBuddy" and navigation:


Improving content extraction to filter out copyright notices, navigation text, and other unwanted content:


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

Checking for linting errors and verifying the changes:


Checking if the content might be in an iframe or another structure. Reviewing the HTML structure around the content area:


The "©NovelBuddy" text is in a sidebar/footer, not the main content. Ensuring we target the correct content area and improving the selector logic:


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


## Changes Made:

1. **Added `.content-inner` selector**: Added `.content-inner` to the content selectors in both `hasContent()` and `scrapeChapter()`, since NovelBuddy uses this class for the main chapter content.

2. **Improved content detection**: Updated the selector logic to:
   - Prioritize `.content-inner` when it exists and has substantial content (>200 characters)
   - Only use elements with meaningful content to avoid picking up sidebars or footers

3. **Enhanced content filtering**: Added filtering to exclude unwanted content:
   - Copyright notices like "©NovelBuddy"
   - Navigation text like "← Previous Chapter | Next Chapter →"
   - Audio player messages
   - Very short paragraphs that are likely metadata

The plugin should now extract the chapter content starting with "Jun Xiaoyao did not move on the surface, but he was a little surprised." instead of only "©NovelBuddy".

The changes maintain backward compatibility with other content selectors while prioritizing the correct NovelBuddy structure.

