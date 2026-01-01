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
    // Use 'domcontentloaded' instead of 'networkidle2' for faster page loads
    // Content is typically available after DOM is ready, and scrolling will handle lazy-loaded content
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Scroll to load lazy-loaded content
    // Reduced default delay from 1000ms to 400ms for faster processing
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);

    // Extract both title and chapter number from page in a single evaluation
    // The title attribute contains format like "V2 Chapter 27: ..." or "Chapter 27: ..."
    // If no volume is specified, assume volume 1
    // Chapter numbers are left-padded to 3 digits, and part numbers are appended
    // Example: "V2 Chapter 137" with "part 1" → 2.1371
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to clean title text
      const cleanTitle = (text) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove volume/chapter prefix patterns like "V2 Chapter 27: " or "Chapter 27: "
        cleaned = cleaned.replace(/^V\d+\s+Chapter\s+\d+[:\s]*/i, '');
        cleaned = cleaned.replace(/^Chapter\s+\d+[:\s]*/i, '');
        
        // Remove "WordyCrown" if it appears (site name)
        cleaned = cleaned.replace(/\s*WordyCrown\s*/gi, '');
        cleaned = cleaned.trim();
        
        // Return null if empty or just site name
        if (!cleaned || cleaned === 'WordyCrown') {
          return null;
        }
        
        return cleaned;
      };
      
      // Helper function to find title from an element's text content or title attribute
      const findTitleFromElement = (element) => {
        if (!element) return null;
        
        // Try text content first
        const textContent = element.textContent;
        if (textContent) {
          const cleaned = cleanTitle(textContent);
          if (cleaned) return cleaned;
        }
        
        // Try title attribute
        const titleAttr = element.getAttribute('title');
        if (titleAttr) {
          const cleaned = cleanTitle(titleAttr);
          if (cleaned) return cleaned;
        }
        
        return null;
      };
      
      // Helper function to extract chapter number from title text
      const extractChapterNumber = (titleText) => {
        if (!titleText) return null;
        
        let volume = null;
        let chapter = null;
        
        // Try pattern with explicit volume: "V2 Chapter 27" or "v2 chapter 27"
        let match = titleText.match(/V(\d+)\s+Chapter\s+(\d+)/i);
        if (match) {
          volume = parseInt(match[1], 10);
          chapter = parseInt(match[2], 10);
        } else {
          // Try pattern without volume: "Chapter 27" - assume volume 1
          match = titleText.match(/Chapter\s+(\d+)/i);
          if (match) {
            volume = 1;
            chapter = parseInt(match[1], 10);
          } else {
            return null;
          }
        }
        
        // Left-pad chapter to 3 digits
        const chapterPadded = chapter.toString().padStart(3, '0');
        
        // Format as {volume}.{chapter_padded} (part will be appended later if found)
        return {
          volume,
          chapter,
          chapterPadded,
          part: null
        };
      };
      
      // Helper function to extract part number from text
      const extractPartNumber = (text) => {
        if (!text) return null;
        // Look for "part 1", "Part 1", "part1", "Part1", etc. at the end of the text
        const partMatch = text.match(/part\s*(\d+)\s*$/i);
        if (partMatch) {
          return parseInt(partMatch[1], 10);
        }
        return null;
      };
      
      // Get the h1 title to check for part number
      const h1Title = document.querySelector('h1.entry-title, h1, .entry-title');
      const h1TitleText = h1Title ? h1Title.textContent.trim() : '';
      const partNumber = extractPartNumber(h1TitleText);
      
      // Extract title using the same locations we'll use for chapter number
      let foundTitle = null;
      let foundChapterNumber = null;
      
      // List of possible title locations to check (in order of preference)
      const titleLocations = [
        // 1. h1 elements
        () => {
          const h1 = document.querySelector('h1.entry-title, h1, .entry-title');
          return findTitleFromElement(h1);
        },
        
        // 2. Title attribute from elements before publication date
        () => {
          const timeElements = Array.from(document.querySelectorAll('time[datetime], time, .published, [class*="date"], [class*="published"]'));
          
          for (const timeEl of timeElements) {
            const candidates = [
              timeEl.parentElement,
              timeEl.previousElementSibling,
              timeEl.parentElement?.previousElementSibling
            ].filter(Boolean);
            
            for (const candidate of candidates) {
              const title = findTitleFromElement(candidate);
              if (title) return title;
              
              // Check direct children
              for (const child of candidate.children) {
                const childTitle = findTitleFromElement(child);
                if (childTitle) return childTitle;
              }
            }
          }
          
          return null;
        },
        
        // 3. Any element with title attribute containing chapter info
        () => {
          const allElementsWithTitle = document.querySelectorAll('[title]');
          for (const el of allElementsWithTitle) {
            const title = findTitleFromElement(el);
            if (title) return title;
          }
          return null;
        }
      ];
      
      // Try each location until we find a valid title
      for (const findTitle of titleLocations) {
        const title = findTitle();
        if (title) {
          foundTitle = title;
          break;
        }
      }
      
      // Extract chapter number from title attribute of element before publication date
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
            // Add part number if found in title
            if (partNumber !== null) {
              result.part = partNumber;
            }
            // Format: {volume}.{chapter_padded}{part}
            foundChapterNumber = result.part !== null 
              ? parseFloat(`${result.volume}.${result.chapterPadded}${result.part}`)
              : parseFloat(`${result.volume}.${result.chapterPadded}`);
            break;
          }
          
          // Also check direct children
          for (const child of candidate.children) {
            const childTitleAttr = child.getAttribute('title');
            const childResult = extractChapterNumber(childTitleAttr);
            if (childResult !== null) {
              // Add part number if found in title
              if (partNumber !== null) {
                childResult.part = partNumber;
              }
              // Format: {volume}.{chapter_padded}{part}
              foundChapterNumber = childResult.part !== null 
                ? parseFloat(`${childResult.volume}.${childResult.chapterPadded}${childResult.part}`)
                : parseFloat(`${childResult.volume}.${childResult.chapterPadded}`);
              break;
            }
          }
          
          if (foundChapterNumber !== null) break;
        }
        
        if (foundChapterNumber !== null) break;
      }
      
      // Fallback: search entire document for any element with title attribute matching pattern
      if (foundChapterNumber === null) {
        const allElementsWithTitle = document.querySelectorAll('[title]');
        for (const el of allElementsWithTitle) {
          const titleAttr = el.getAttribute('title');
          const result = extractChapterNumber(titleAttr);
          if (result !== null) {
            // Add part number if found in title
            if (partNumber !== null) {
              result.part = partNumber;
            }
            // Format: {volume}.{chapter_padded}{part}
            foundChapterNumber = result.part !== null 
              ? parseFloat(`${result.volume}.${result.chapterPadded}${result.part}`)
              : parseFloat(`${result.volume}.${result.chapterPadded}`);
            break;
          }
        }
      }
      
      // Fallback: try to extract from h1 title text if chapter number not found
      if (foundChapterNumber === null && h1TitleText) {
        let volume = null;
        let chapter = null;
        
        // Try pattern with explicit volume: "V2 Chapter 27" or "v2 chapter 27"
        let titleMatch = h1TitleText.match(/[Vv](\d+)\s+[Cc]hapter\s+(\d+)/);
        if (titleMatch) {
          volume = parseInt(titleMatch[1], 10);
          chapter = parseInt(titleMatch[2], 10);
        } else {
          // Try pattern without volume: "Chapter 27" - assume volume 1
          titleMatch = h1TitleText.match(/[Cc]hapter\s+(\d+)/);
          if (titleMatch) {
            volume = 1;
            chapter = parseInt(titleMatch[1], 10);
          } else {
            // Last resort: use 1.001
            volume = 1;
            chapter = 1;
          }
        }
        
        if (volume !== null && chapter !== null) {
          // Left-pad chapter to 3 digits
          const chapterPadded = chapter.toString().padStart(3, '0');
          
          // Extract part number from title (look for "part 1", "Part 1", etc. at the end)
          const partMatch = h1TitleText.match(/part\s*(\d+)\s*$/i);
          const extractedPartNumber = partMatch ? parseInt(partMatch[1], 10) : null;
          
          // Format: {volume}.{chapter_padded}{part}
          if (extractedPartNumber !== null) {
            foundChapterNumber = parseFloat(`${volume}.${chapterPadded}${extractedPartNumber}`);
          } else {
            foundChapterNumber = parseFloat(`${volume}.${chapterPadded}`);
          }
        }
      }
      
      return {
        title: foundTitle || 'Untitled',
        chapterNumber: foundChapterNumber
      };
    });
    
    // Handle fallback chapter number from options if still null
    if (chapterNumber === null && options.chapterNumber !== undefined && options.chapterNumber !== null) {
      chapterNumber = options.chapterNumber;
    }

    // Extract content and images in a single evaluation
    const { content, images } = await page.evaluate(() => {
      const contentEl = document.querySelector('.entry-content, article .entry-content, article');
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, .chapter-support, #nav-below, .patreon-btn, .chapter-support-note, nav, footer, #disqus_thread');
      unwanted.forEach(el => el.remove());
      
      // Extract images before processing text
      const imgElements = clone.querySelectorAll('img');
      const extractedImages = Array.from(imgElements)
        .map(img => img.src || img.getAttribute('data-src'))
        .filter(src => src && !src.includes('patreon') && !src.includes('logo'))
        .filter(Boolean);
      
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
      
      return {
        content: text.trim(),
        images: extractedImages
      };
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
  // Reduced delay from 500ms to 200ms for faster processing
  await page.waitForTimeout(200);
}
