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
