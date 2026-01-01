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
    // Chapter numbers are left-padded to 4 digits, and part numbers are appended
    // Example: "V2 Chapter 137" with "part 1" → 2.01371
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to clean title text
      const cleanTitle = (text) => {
        if (!text) return null;
        
        let cleaned = text.trim();
        
        // Remove trailing " &#8211; WordyCrown" or " – WordyCrown" (en-dash entity or actual dash)
        // Handle various forms: decoded dash, HTML entity, or encoded entity
        // Note: textContent may decode &amp; to &, so &amp;#8211; becomes &#8211;
        // The dash character can be: – (en-dash), — (em-dash), or the entity &#8211;
        cleaned = cleaned.replace(/\s*[–—]\s*WordyCrown\s*$/i, '');
        cleaned = cleaned.replace(/\s*&#8211;\s*WordyCrown\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;#8211;\s*WordyCrown\s*$/i, '');
        cleaned = cleaned.replace(/\s*&amp;.*?8211.*?\s*WordyCrown\s*$/i, '');
        // Also handle if there's just whitespace and WordyCrown at the end
        cleaned = cleaned.replace(/\s+WordyCrown\s*$/i, '');
        
        // Remove volume/chapter/episode prefix patterns like "V2 Chapter 27: ", "Chapter 27: ", "Episode 27: ", "ep 27: ", etc.
        cleaned = cleaned.replace(/^V\d+\s+(?:Chapter|Chap|Episode|Ep\.?)\s+\d+[:\s]*/i, '');
        cleaned = cleaned.replace(/^(?:Chapter|Chap|Episode|Ep\.?)\s+\d+[:\s]*/i, '');
        
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from standard HTML elements
      // The title appears in multiple places:
      // 1. <title> tag in document head: "V2 Chapter 27: Old Man, Are You Trying to Fool Me? &#8211; WordyCrown"
      // 2. h1.page-title: "V2 Chapter 27: Old Man, Are You Trying to Fool Me?"
      // 3. h3.post-title: "V2 Chapter 27: Old Man, Are You Trying to Fool Me?"
      // Returns: { raw: string, cleaned: string } or null
      const extractTitleFromStandardElements = () => {
        let rawTitleText = null;
        
        // Method 1: Try <title> tag in document head (most reliable)
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        // Method 2: Try h1.page-title
        const h1Title = document.querySelector('h1.page-title');
        if (h1Title) {
          rawTitleText = h1Title.textContent || h1Title.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        // Method 3: Try h3.post-title
        const h3Title = document.querySelector('h3.post-title');
        if (h3Title) {
          rawTitleText = h3Title.textContent || h3Title.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        // Method 4: Try any h1 that's not the site title
        const h1Elements = document.querySelectorAll('h1');
        for (const h1 of h1Elements) {
          // Skip site title
          if (h1.classList.contains('site-title')) continue;
          rawTitleText = h1.textContent || h1.innerText || '';
          if (rawTitleText.trim()) {
            const cleaned = cleanTitle(rawTitleText.trim());
            if (cleaned) return { raw: rawTitleText.trim(), cleaned: cleaned };
          }
        }
        
        return null;
      };
      
      // Helper function to normalize chapter number decimal portion to at least 4 digits
      const normalizeChapterNumber = (volume, chapter, part = null) => {
        // Left-pad chapter to 4 digits for the integer part
        const chapterPadded = chapter.toString().padStart(4, '0');
        
        // Format as {volume}.{chapter_padded} and ensure decimal portion has at least 4 digits
        // If part is provided, append it; otherwise ensure we have at least 4 digits after decimal
        let chapterNumberStr;
        if (part !== null) {
          // Format: volume.chapterPadded + part (e.g., 2.00201 for volume 2, chapter 20, part 1)
          // The part is appended directly to the chapter number
          chapterNumberStr = `${volume}.${chapterPadded}${part}`;
        } else {
          // Format: volume.chapterPadded (e.g., 2.0020)
          chapterNumberStr = `${volume}.${chapterPadded}`;
        }
        
        // Parse and reformat to ensure proper decimal precision
        // Split by decimal point to normalize
        const parts = chapterNumberStr.split('.');
        if (parts.length === 2) {
          const integerPart = parts[0];
          const decimalPart = parts[1];
          // If we have a part number, don't truncate it - preserve the full decimal part
          // Otherwise, ensure decimal part has at least 4 digits (right-pad with zeros if needed)
          if (part !== null) {
            // Keep the full decimal part as-is (includes the part number)
            chapterNumberStr = `${integerPart}.${decimalPart}`;
          } else {
            // Ensure decimal part has at least 4 digits (right-pad with zeros if needed)
            const normalizedDecimal = decimalPart.padEnd(4, '0');
            chapterNumberStr = `${integerPart}.${normalizedDecimal}`;
          }
        }
        
        return parseFloat(chapterNumberStr);
      };
      
      // Helper function to extract chapter number from title text
      // Handles "Chapter", "Chap", "Episode", "ep", "Ep", etc.
      const extractChapterNumber = (titleText) => {
        if (!titleText) return null;
        
        let volume = null;
        let chapter = null;
        
        // Try pattern with explicit volume: "V2 Chapter 27", "V2 Episode 27", "v2 ep 27", etc.
        // Match: V{number} followed by Chapter/Chap/Episode/ep (case insensitive) followed by {number}
        let match = titleText.match(/V(\d+)\s+(?:Chapter|Chap|Episode|Ep\.?)\s+(\d+)/i);
        if (match) {
          volume = parseInt(match[1], 10);
          chapter = parseInt(match[2], 10);
        } else {
          // Try pattern without volume: "Chapter 27", "Episode 27", "ep 27", etc. - assume volume 1
          match = titleText.match(/(?:Chapter|Chap|Episode|Ep\.?)\s+(\d+)/i);
          if (match) {
            volume = 1;
            chapter = parseInt(match[1], 10);
          } else {
            return null;
          }
        }
        
        // Left-pad chapter to 4 digits
        const chapterPadded = chapter.toString().padStart(4, '0');
        
        // Format as {volume}.{chapter_padded} (part will be appended later if found)
        return {
          volume,
          chapter,
          chapterPadded,
          part: null
        };
      };
      
      // Helper function to extract part number from text
      // Handles variations like:
      // - "Part 1", "part 1", "PART 1"
      // - "pt 1", "Pt 1", "PT 1"
      // - "Part: 1", "Part-1", "Part.1"
      // - "(Part 1)", "(part 1)", etc.
      const extractPartNumber = (text) => {
        if (!text) return null;
        
        // Try multiple patterns to catch various formats
        // Pattern 1: "part" or "pt" (case insensitive) followed by optional separator and number
        // Separators can be: space, colon, dash, period, or parentheses
        // Look for patterns like: "Part 1", "part:1", "pt-1", "(Part 1)", "Part.1", etc.
        const patterns = [
          // Pattern: (Part 1) or (part 1) - in parentheses
          /\([^)]*(?:part|pt)[\s:.\-]*(\d+)[^)]*\)/i,
          // Pattern: Part 1, part: 1, pt-1, etc. - with various separators
          /(?:part|pt)[\s:.\-]+(\d+)/i,
          // Pattern: Part1, part1, pt1 - no separator
          /(?:part|pt)(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            return parseInt(match[1], 10);
          }
        }
        
        return null;
      };
      
      
      // Extract title from standard HTML elements (returns both raw and cleaned)
      const titleResult = extractTitleFromStandardElements();
      const foundTitle = titleResult ? titleResult.cleaned : null;
      const rawTitleText = titleResult ? titleResult.raw : null;
      
      // Extract part number from both raw and cleaned title (try both to catch all variations)
      let partNumber = null;
      if (rawTitleText) {
        partNumber = extractPartNumber(rawTitleText);
      }
      // Also check cleaned title if not found in raw title
      if (partNumber === null && foundTitle) {
        partNumber = extractPartNumber(foundTitle);
      }
      
      let foundChapterNumber = null;
      
      // Extract chapter number from the raw title text
      if (rawTitleText) {
        const chapterResult = extractChapterNumber(rawTitleText);
        if (chapterResult) {
          if (partNumber !== null) {
            chapterResult.part = partNumber;
          }
          foundChapterNumber = normalizeChapterNumber(
            chapterResult.volume,
            chapterResult.chapter,
            chapterResult.part
          );
        }
      }
      
      // Fallback: Extract chapter number from title attribute of element before publication date
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
            // Format: {volume}.{chapter_padded}{part} with normalization
            foundChapterNumber = normalizeChapterNumber(
              result.volume,
              result.chapter,
              result.part
            );
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
              // Format: {volume}.{chapter_padded}{part} with normalization
              foundChapterNumber = normalizeChapterNumber(
                childResult.volume,
                childResult.chapter,
                childResult.part
              );
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
            // Format: {volume}.{chapter_padded}{part} with normalization
            foundChapterNumber = normalizeChapterNumber(
              result.volume,
              result.chapter,
              result.part
            );
            break;
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
