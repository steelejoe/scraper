/**
 * Plugin for www.wordycrown.com
 * 
 * This plugin scrapes chapter content from WordyCrown.com.
 * Chapters are numbered as {volume}.{chapter} (e.g., 2.27 for Volume 2, Chapter 27).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // Find the navigation element with id="nav-below"
    const navElement = await page.$('#nav-below');
    if (!navElement) {
      return null;
    }

    // Find the next link (nav-next div with rel="next")
    const nextLink = await navElement.$('div.nav-next a[rel="next"]');
    if (!nextLink) {
      return null;
    }

    const href = await page.evaluate(el => el.href, nextLink);
    return href || null;
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
    // Find the navigation element with id="nav-below"
    const navElement = await page.$('#nav-below');
    if (!navElement) {
      return null;
    }

    // Find the previous link (nav-previous div with rel="prev")
    const prevLink = await navElement.$('div.nav-previous a[rel="prev"]');
    if (!prevLink) {
      return null;
    }

    const href = await page.evaluate(el => el.href, prevLink);
    return href || null;
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
    // Check for entry-content div (main content area)
    const contentSelectors = [
      '.entry-content',
      'article .entry-content',
      'article',
      'main .entry-content'
    ];

    for (const selector of contentSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Check if element has meaningful text content
        const text = await page.evaluate(el => {
          // Remove script and style tags
          const scripts = el.querySelectorAll('script, style, .chapter-support, #nav-below');
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
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 1000, options.maxScrolls || 10);

    // Extract title from h1
    const title = await page.evaluate(() => {
      const titleEl = document.querySelector('h1.entry-title, h1, .entry-title');
      return titleEl ? titleEl.textContent.trim() : 'Untitled';
    });

    // Extract chapter number from title attribute of element before publication date
    // The title attribute contains format like "V2 Chapter 27: ..." or "Chapter 27: ..."
    // If no volume is specified, assume volume 1
    let chapterNumber = null;
    
    chapterNumber = await page.evaluate(() => {
      // Helper function to extract chapter number from title text
      const extractChapterNumber = (titleText) => {
        if (!titleText) return null;
        
        // Try pattern with explicit volume: "V2 Chapter 27" or "v2 chapter 27"
        let match = titleText.match(/V(\d+)\s+Chapter\s+(\d+)/i);
        if (match) {
          const volume = parseInt(match[1], 10);
          const chapter = parseInt(match[2], 10);
          return parseFloat(`${volume}.${chapter}`);
        }
        
        // Try pattern without volume: "Chapter 27" - assume volume 1
        match = titleText.match(/Chapter\s+(\d+)/i);
        if (match) {
          const chapter = parseInt(match[1], 10);
          return parseFloat(`1.${chapter}`);
        }
        
        return null;
      };
      
      // Find time/date elements to locate the title element before them
      const timeElements = Array.from(document.querySelectorAll('time[datetime], time, .published, [class*="date"], [class*="published"]'));
      
      for (const timeEl of timeElements) {
        // Look for an element with a title attribute immediately before the date
        // Check: parent element, previous sibling, parent's previous sibling
        const candidates = [
          timeEl.parentElement,
          timeEl.previousElementSibling,
          timeEl.parentElement?.previousElementSibling
        ].filter(Boolean);
        
        // Check candidate elements and their children for title attribute with Volume/Chapter pattern
        for (const candidate of candidates) {
          if (!candidate) continue;
          
          // Check the candidate itself
          const titleAttr = candidate.getAttribute('title');
          const result = extractChapterNumber(titleAttr);
          if (result !== null) {
            return result;
          }
          
          // Also check direct children
          for (const child of candidate.children) {
            const childTitleAttr = child.getAttribute('title');
            const childResult = extractChapterNumber(childTitleAttr);
            if (childResult !== null) {
              return childResult;
            }
          }
        }
      }
      
      // Fallback: search entire document for any element with title attribute matching pattern
      const allElementsWithTitle = document.querySelectorAll('[title]');
      for (const el of allElementsWithTitle) {
        const titleAttr = el.getAttribute('title');
        const result = extractChapterNumber(titleAttr);
        if (result !== null) {
          return result;
        }
      }
      
      return null;
    });
    
    // Fallback: try to extract from h1 title text
    if (chapterNumber === null) {
      // Try pattern with explicit volume: "V2 Chapter 27" or "v2 chapter 27"
      let titleMatch = title.match(/[Vv](\d+)\s+[Cc]hapter\s+(\d+)/);
      if (titleMatch) {
        const volume = parseInt(titleMatch[1], 10);
        const chapter = parseInt(titleMatch[2], 10);
        chapterNumber = parseFloat(`${volume}.${chapter}`);
      } else {
        // Try pattern without volume: "Chapter 27" - assume volume 1
        titleMatch = title.match(/[Cc]hapter\s+(\d+)/);
        if (titleMatch) {
          const chapter = parseInt(titleMatch[1], 10);
          chapterNumber = parseFloat(`1.${chapter}`);
        } else if (options.chapterNumber !== undefined && options.chapterNumber !== null) {
          // Use provided chapter number as fallback
          chapterNumber = options.chapterNumber;
        } else {
          // Last resort: use 1.1
          chapterNumber = 1.1;
        }
      }
    }

    // Extract content from entry-content
    const content = await page.evaluate(() => {
      const contentEl = document.querySelector('.entry-content, article .entry-content, article');
      if (!contentEl) return '';
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, .chapter-support, #nav-below, .patreon-btn, .chapter-support-note, nav, footer, #disqus_thread');
      unwanted.forEach(el => el.remove());
      
      // Get text content and preserve paragraph structure
      const paragraphs = clone.querySelectorAll('p');
      let text = '';
      
      paragraphs.forEach(p => {
        const pText = p.textContent.trim();
        if (pText && pText.length > 0) {
          text += pText + '\n\n';
        }
      });
      
      // If no paragraphs found, fall back to innerText
      if (!text || text.trim().length < 50) {
        text = clone.innerText || clone.textContent || '';
      }
      
      return text.trim();
    });

    // Extract images if any
    const images = await page.evaluate(() => {
      const contentEl = document.querySelector('.entry-content, article');
      if (!contentEl) return [];
      
      const imgElements = contentEl.querySelectorAll('img');
      return Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src'))
        .filter(src => src && !src.includes('patreon') && !src.includes('logo'))
        .filter(Boolean);
    });

    return {
      title,
      content,
      chapterNumber,
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
  await page.waitForTimeout(500);
}
