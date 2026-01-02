/**
 * Plugin for novellive.app
 * 
 * This plugin scrapes chapter content from NovelLive.app.
 * Chapters are numbered sequentially (e.g., 1, 2, 3, ...).
 */

/**
 * Extracts the "next chapter" URL from the current page.
 */
export async function getNextChapterUrl(page) {
  try {
    // NovelLive uses id="next" for next chapter link
    const nextLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const nextBtn = document.getElementById('next');
      if (nextBtn && nextBtn.href && nextBtn.getAttribute('title') === 'Read Next Chapter') {
        const href = nextBtn.href;
        // Skip if it's a reload link or invalid
        if (href && href !== 'about:blank' && !href.includes('javascript:') && !href.includes('reload')) {
          return href;
        }
      }
      
      // Try by title attribute
      const linksByTitle = document.querySelectorAll('a[title="Read Next Chapter"]');
      for (const link of linksByTitle) {
        const href = link.href;
        if (href && href !== window.location.href && href !== 'about:blank' && !href.includes('javascript:') && !href.includes('reload')) {
          return href;
        }
      }
      
      // Fallback: Look for next link in navigation ul
      const navUl = document.querySelector('ul.ul-list7');
      if (navUl) {
        const nextLinkEl = navUl.querySelector('a[title*="Next"], a[title*="next"]');
        if (nextLinkEl) {
          const href = nextLinkEl.href;
          if (href && href !== window.location.href && href !== 'about:blank' && !href.includes('javascript:') && !href.includes('reload')) {
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
    // NovelLive uses id="prev" for previous chapter link
    const prevLink = await page.evaluate(() => {
      // Try by ID first (most reliable)
      const prevBtn = document.getElementById('prev');
      if (prevBtn && prevBtn.href && prevBtn.getAttribute('title') === 'Read Privious Chapter') {
        const href = prevBtn.href;
        // Skip if it's a reload link or invalid (first chapter)
        if (href && href !== 'about:blank' && !href.includes('javascript:') && !href.includes('reload')) {
          return href;
        }
      }
      
      // Try by title attribute (note: typo "Privious" in original)
      const linksByTitle = document.querySelectorAll('a[title="Read Privious Chapter"], a[title="Read Previous Chapter"]');
      for (const link of linksByTitle) {
        const href = link.href;
        if (href && href !== window.location.href && href !== 'about:blank' && !href.includes('javascript:') && !href.includes('reload')) {
          return href;
        }
      }
      
      // Fallback: Look for prev link in navigation ul
      const navUl = document.querySelector('ul.ul-list7');
      if (navUl) {
        const prevLinkEl = navUl.querySelector('li.prev a, a[title*="Prev"], a[title*="prev"]');
        if (prevLinkEl) {
          const href = prevLinkEl.href;
          if (href && href !== window.location.href && href !== 'about:blank' && !href.includes('javascript:') && !href.includes('reload')) {
            return href;
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
 * Detects if the current page has actual content.
 * 
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Optional configuration
 * @param {boolean} options.debug - Enable debug logging (default: false)
 */
export async function hasContent(page, options = {}) {
  const debug = options.debug || false;
  try {
    if (debug) console.log('[DEBUG hasContent] Starting content detection...');
    
    // First check if we're on a Cloudflare challenge page
    const isCloudflarePage = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      return bodyText.includes('Checking your browser') || 
             bodyText.includes('Just a moment') || 
             bodyText.includes('Verifying you are human') ||
             bodyText.includes('DDoS protection by Cloudflare');
    });
    
    if (debug) console.log('[DEBUG hasContent] Is Cloudflare page:', isCloudflarePage);
    
    // If we're on Cloudflare page, wait for it to complete
    if (isCloudflarePage) {
      if (debug) console.log('[DEBUG hasContent] Detected Cloudflare challenge, waiting for it to complete...');
      try {
        // Wait for navigation first (Cloudflare usually redirects)
        // Try networkidle2 which waits for network to be idle (better for Cloudflare)
        try {
          await page.waitForNavigation({ timeout: 60000, waitUntil: 'networkidle2' });
          if (debug) console.log('[DEBUG hasContent] Navigation completed (networkidle2)');
        } catch (navError) {
          // Fallback to domcontentloaded if networkidle2 times out
          if (debug) console.log('[DEBUG hasContent] networkidle2 timed out, trying domcontentloaded...');
          await page.waitForNavigation({ timeout: 30000, waitUntil: 'domcontentloaded' }).catch(() => null);
        }
        
        // Wait for content elements to appear (indicating Cloudflare passed and content loaded)
        // Try multiple times with increasing wait times
        let contentFound = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          await page.waitForTimeout(3000); // Wait 3 seconds between attempts
          
          // Check if we're still on Cloudflare page
          const stillCloudflare = await page.evaluate(() => {
            const bodyText = document.body.innerText || '';
            return bodyText.includes('Checking your browser') || 
                   bodyText.includes('Just a moment') || 
                   bodyText.includes('Verifying you are human') ||
                   bodyText.includes('DDoS protection by Cloudflare');
          });
          
          if (!stillCloudflare) {
            // Not on Cloudflare page anymore, wait for content
            try {
              await page.waitForSelector('.txt, td.line-content, .m-read, span.chapter', { timeout: 5000 });
              contentFound = true;
              if (debug) console.log(`[DEBUG hasContent] Content elements found after attempt ${attempt + 1}`);
              break;
            } catch (e) {
              // Continue waiting
              if (debug && attempt % 2 === 0) console.log(`[DEBUG hasContent] Content not found yet, attempt ${attempt + 1}/10`);
            }
          } else {
            if (debug && attempt % 2 === 0) console.log(`[DEBUG hasContent] Still on Cloudflare page, attempt ${attempt + 1}/10`);
          }
        }
        
        // Wait a bit more for content to fully load (JavaScript might still be loading content)
        await page.waitForTimeout(3000);
        
        // Check if we're still on Cloudflare page after all waiting
        const stillCloudflareAfterWait = await page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          return bodyText.includes('Checking your browser') || 
                 bodyText.includes('Just a moment') || 
                 bodyText.includes('Verifying you are human') ||
                 bodyText.includes('DDoS protection by Cloudflare');
        });
        
        if (debug) {
          console.log('[DEBUG hasContent] Finished waiting for Cloudflare');
          console.log('[DEBUG hasContent] Still on Cloudflare page after wait:', stillCloudflareAfterWait);
        }
        
        // If still on Cloudflare, wait even longer (up to 30 more seconds)
        if (stillCloudflareAfterWait) {
          if (debug) console.log('[DEBUG hasContent] Still on Cloudflare, waiting up to 30 more seconds...');
          for (let i = 0; i < 6; i++) {
            await page.waitForTimeout(5000);
            const checkStillCloudflare = await page.evaluate(() => {
              const bodyText = document.body.innerText || '';
              return bodyText.includes('Checking your browser') || 
                     bodyText.includes('Just a moment') || 
                     bodyText.includes('Verifying you are human') ||
                     bodyText.includes('DDoS protection by Cloudflare');
            });
            if (!checkStillCloudflare) {
              if (debug) console.log(`[DEBUG hasContent] Cloudflare cleared after additional wait (attempt ${i + 1})`);
              break;
            }
          }
        }
      } catch (waitError) {
        if (debug) console.warn('[DEBUG hasContent] Error waiting for Cloudflare:', waitError.message);
        // Wait a bit more and continue anyway
        await page.waitForTimeout(5000);
      }
    }
    // Check for main content area - NovelLive uses .txt as the main content container
    // Try multiple approaches to find content
    const contentCheckResult = await page.evaluate(() => {
      const result = {
        found: false,
        strategies: {
          txtDiv: { tried: false, found: false, textLength: 0 },
          paragraphs: { tried: false, count: 0, totalTextLength: 0 },
          lineContentCells: { tried: false, count: 0, totalTextLength: 0 },
          divsWithParagraphs: { tried: false, count: 0, bestDivTextLength: 0 }
        }
      };
      
      // Strategy 1: Look for .txt div
      const txtDiv = document.querySelector('.txt') || document.querySelector('div.txt');
      result.strategies.txtDiv.tried = true;
      if (txtDiv) {
        result.strategies.txtDiv.found = true;
        // Remove unwanted elements
        const clone = txtDiv.cloneNode(true);
        const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .ul-list7, header, .header, .chapter-start, .chapter-end, .top, .error, .tips');
        unwanted.forEach(el => el.remove());
        const text = clone.textContent.trim();
        result.strategies.txtDiv.textLength = text.length;
        if (text && text.length > 50) {
          result.found = true;
          return result;
        }
      }
      
      // Strategy 2: Look for paragraphs with substantial text content
      const allParagraphs = document.querySelectorAll('p');
      result.strategies.paragraphs.tried = true;
      result.strategies.paragraphs.count = allParagraphs.length;
      let totalText = '';
      for (const p of allParagraphs) {
        const text = p.textContent.trim();
        // Look for paragraph content that seems like chapter text (more than just navigation/metadata)
        if (text && text.length > 20 && !text.match(/^(Chapter \d+|Prev Chapter|Next Chapter|Report chapter|Use arrow keys)/i)) {
          totalText += text + ' ';
          if (totalText.length > 200) {
            result.strategies.paragraphs.totalTextLength = totalText.length;
            result.found = true;
            return result;
          }
        }
      }
      result.strategies.paragraphs.totalTextLength = totalText.length;
      
      // Strategy 3: Look for content in table cells with class "line-content"
      const lineContentCells = document.querySelectorAll('td.line-content');
      result.strategies.lineContentCells.tried = true;
      result.strategies.lineContentCells.count = lineContentCells.length;
      if (lineContentCells.length > 0) {
        let totalText = '';
        for (const cell of lineContentCells) {
          const text = cell.textContent.trim();
          if (text && text.length > 20) {
            totalText += text + ' ';
            if (totalText.length > 200) {
              result.strategies.lineContentCells.totalTextLength = totalText.length;
              result.found = true;
              return result;
            }
          }
        }
        result.strategies.lineContentCells.totalTextLength = totalText.length;
      }
      
      // Strategy 4: Look for any div with substantial paragraph content
      const allDivs = Array.from(document.querySelectorAll('div'));
      result.strategies.divsWithParagraphs.tried = true;
      result.strategies.divsWithParagraphs.count = allDivs.length;
      for (const div of allDivs) {
        const paragraphs = div.querySelectorAll('p');
        if (paragraphs.length > 5) {
          let divText = '';
          for (const p of paragraphs) {
            const text = p.textContent.trim();
            if (text && text.length > 20) {
              divText += text + ' ';
            }
          }
          if (divText.length > result.strategies.divsWithParagraphs.bestDivTextLength) {
            result.strategies.divsWithParagraphs.bestDivTextLength = divText.length;
            if (divText.length > 200) {
              result.found = true;
              return result;
            }
          }
        }
      }
      
      return result;
    });
    
    if (debug) {
      console.log('[DEBUG hasContent] Content check result:', JSON.stringify(contentCheckResult, null, 2));
      console.log('[DEBUG hasContent] Found content:', contentCheckResult.found);
    }
    
    return contentCheckResult.found;
  } catch (error) {
    console.error('Error checking content:', error);
    return false;
  }
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
    if (debug) {
      console.log('[DEBUG scrapeChapter] Current URL:', currentUrl);
      console.log('[DEBUG scrapeChapter] Target URL:', url);
    }
    
    if (currentUrl !== url) {
      if (debug) console.log('[DEBUG scrapeChapter] Navigating to URL...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (debug) console.log('[DEBUG scrapeChapter] Page loaded, URL after navigation:', page.url());
      
      // Wait for Cloudflare challenge to complete (if present)
      if (debug) console.log('[DEBUG scrapeChapter] Waiting for Cloudflare challenge to complete...');
      // Try waiting for actual content elements that indicate the real page has loaded
      try {
        await Promise.race([
          // Wait for any of these content indicators
          page.waitForSelector('.txt', { timeout: 30000 }).catch(() => null),
          page.waitForSelector('td.line-content', { timeout: 30000 }).catch(() => null),
          page.waitForSelector('.m-read', { timeout: 30000 }).catch(() => null),
          page.waitForSelector('span.chapter', { timeout: 30000 }).catch(() => null),
          // Also wait for navigation (Cloudflare often redirects)
          page.waitForNavigation({ timeout: 30000, waitUntil: 'domcontentloaded' }).catch(() => null)
        ]);
      } catch (waitError) {
        // If waiting fails, check if we're on Cloudflare page and wait longer
        const isCloudflare = await page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          return bodyText.includes('Checking your browser') || 
                 bodyText.includes('Just a moment') || 
                 bodyText.includes('Verifying you are human') ||
                 bodyText.includes('DDoS protection by Cloudflare');
        });
        
        if (isCloudflare) {
          if (debug) console.warn('[DEBUG scrapeChapter] Detected Cloudflare challenge page, waiting longer...');
          // Wait longer for Cloudflare to complete (can take 5-15 seconds)
          await page.waitForTimeout(10000);
          // Try waiting for content again
          try {
            await page.waitForSelector('.txt, td.line-content, .m-read, span.chapter', { timeout: 20000 });
          } catch (e) {
            if (debug) console.warn('[DEBUG scrapeChapter] Still waiting for content after Cloudflare challenge');
          }
        }
      }
    }

    // Additional wait to ensure content is fully loaded
    await page.waitForTimeout(2000);
    if (debug) console.log('[DEBUG scrapeChapter] Finished waiting, starting to scroll...');

    // Scroll to load lazy-loaded content
    await scrollPage(page, options.scrollDelay || 400, options.maxScrolls || 10);
    if (debug) console.log('[DEBUG scrapeChapter] Finished scrolling');

    // DEBUG: Save page HTML for inspection (only if debug enabled)
    if (debug) {
      try {
        const fs = await import('fs');
        const pageHtml = await page.content();
        const debugDir = 'samples/debug';
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        const debugFile = `${debugDir}/novellive_debug_${Date.now()}.html`;
        fs.writeFileSync(debugFile, pageHtml, 'utf8');
        console.log(`[DEBUG scrapeChapter] Saved page HTML to ${debugFile}`);
      } catch (debugError) {
        console.error('[DEBUG scrapeChapter] Failed to save page HTML:', debugError.message);
      }
    }

    // Extract title and chapter number from page
    const { title, chapterNumber } = await page.evaluate(() => {
      // Helper function to clean chapter title by removing prefixes and trailing site name
      const cleanChapterTitle = (titleText) => {
        if (!titleText) return null;
        
        let cleaned = titleText.trim();
        
        // Remove trailing " - Novel Live" or similar site name variations
        cleaned = cleaned.replace(/\s*[–—]\s*Novel\s+Live[^]*$/i, '');
        cleaned = cleaned.replace(/\s*[–—]\s*Reading\s+Novel\s+Free[^]*$/i, '');
        cleaned = cleaned.replace(/\s*[–—\-]\s*Novel\s+Live[^]*$/i, '');
        
        // Remove book title prefix: "Reincarnation Of The Strongest Sword God - Chapter 1 - Starting Over"
        // Pattern: book title - Chapter N - chapter title
        // Extract just the chapter title part
        const chapterMatch = cleaned.match(/-\s*Chapter\s+\d+\s*-\s*(.+)/i);
        if (chapterMatch && chapterMatch[1]) {
          cleaned = chapterMatch[1].trim();
        } else {
          // If no match, try removing "Chapter N -" or "Chapter N:" prefix
          cleaned = cleaned.replace(/^.*?Chapter\s+\d+[:\s\-–—]+/i, '');
        }
        
        // Remove trailing separators
        cleaned = cleaned.replace(/\s*[–—\-]\s*$/, '');
        cleaned = cleaned.trim();
        
        // Return null if empty
        if (!cleaned) {
          return null;
        }
        
        return cleaned;
      };
      
      // Extract title from multiple sources
      let rawTitleText = null;
      
      // Method 1: Try <span class="chapter"> element (most reliable for chapter title)
      const chapterSpan = document.querySelector('span.chapter');
      if (chapterSpan) {
        rawTitleText = chapterSpan.textContent || chapterSpan.innerText || '';
      }
      
      // Method 2: Try meta tag og:novel:chapter_name
      if (!rawTitleText || !rawTitleText.trim()) {
        const ogChapterName = document.querySelector('meta[property="og:novel:chapter_name"]');
        if (ogChapterName) {
          rawTitleText = ogChapterName.getAttribute('content') || '';
        }
      }
      
      // Method 3: Try <title> tag
      if (!rawTitleText || !rawTitleText.trim()) {
        const titleTag = document.querySelector('title');
        if (titleTag) {
          rawTitleText = titleTag.textContent || titleTag.innerText || '';
        }
      }
      
      if (!rawTitleText || !rawTitleText.trim()) {
        return {
          title: 'Untitled',
          chapterNumber: null
        };
      }
      
      // Clean the chapter title
      const cleanedChapterTitle = cleanChapterTitle(rawTitleText.trim());
      
      // Extract chapter number from title or URL
      const extractChapterNumber = (titleText, url) => {
        // First try to extract from title text
        if (titleText) {
          // Pattern: "Chapter 1" or "Chapter 1 -" or "Chapter 1:"
          let match = titleText.match(/Chapter\s+(\d+)/i);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        
        // Fallback: Extract from URL pattern: /chapter-(\d+)/
        if (url) {
          const urlMatch = url.match(/chapter-(\d+)/i);
          if (urlMatch) {
            return parseInt(urlMatch[1], 10);
          }
        }
        
        return null;
      };
      
      const foundChapterNumber = extractChapterNumber(rawTitleText || '', window.location.href);
      
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

    // DEBUG: Get information about what we're finding (only if debug enabled)
    let debugInfo = null;
    if (debug) {
      debugInfo = await page.evaluate(() => {
      const info = {
        hasTxtDiv: !!document.querySelector('.txt'),
        hasDivTxt: !!document.querySelector('div.txt'),
        txtDivCount: document.querySelectorAll('.txt, div.txt').length,
        lineContentCellCount: document.querySelectorAll('td.line-content').length,
        paragraphCount: document.querySelectorAll('p').length,
        allDivsWithClass: [],
        sampleLineContentCells: []
      };
      
      // Get sample of div classes
      const divs = Array.from(document.querySelectorAll('div[class]')).slice(0, 20);
      divs.forEach(div => {
        if (div.className) {
          info.allDivsWithClass.push(div.className);
        }
      });
      
      // Get sample of line-content cells
      const cells = Array.from(document.querySelectorAll('td.line-content')).slice(0, 10);
      cells.forEach(cell => {
        info.sampleLineContentCells.push({
          text: cell.textContent.substring(0, 100),
          innerHTML: cell.innerHTML.substring(0, 200)
        });
      });
      
      return info;
      });
      
      console.log('[DEBUG scrapeChapter] Page structure info:', JSON.stringify(debugInfo, null, 2));
    }

    // Extract content
    const { content, images } = await page.evaluate(() => {
      // Strategy 1: Try .txt div (primary selector for NovelLive)
      let contentEl = document.querySelector('.txt') || document.querySelector('div.txt');
      
      // Strategy 2: If .txt not found, try other common selectors
      if (!contentEl) {
        const contentSelectors = [
          '.m-read .txt',
          '.m-read div.txt',
          '.chapter-content',
          '.content',
          '.entry-content',
          'article',
          'main .txt'
        ];
        
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent || '';
            if (text.length > 100) {
              contentEl = element;
              break;
            }
          }
        }
      }
      
      // Strategy 3: Look for content in table cells with class "line-content"
      let isTableContent = false;
      let tableCellTexts = [];
      if (!contentEl) {
        const lineContentCells = document.querySelectorAll('td.line-content');
        if (lineContentCells.length > 0) {
          for (const cell of lineContentCells) {
            // First try to find paragraph elements within the cell
            const paragraphs = cell.querySelectorAll('p');
            if (paragraphs.length > 0) {
              for (const p of paragraphs) {
                const text = p.textContent.trim();
                if (text && text.length > 10) {
                  tableCellTexts.push(text);
                }
              }
            } else {
              // If no paragraphs, use the cell's text content directly
              const text = cell.textContent.trim();
              // Filter out HTML tag markup (escaped or otherwise) and keep actual content
              // Skip cells that are just HTML tags or very short
              if (text && text.length > 20 && !text.match(/^[\s\S]*&lt;\/?[a-z]+[^&]*&gt;[\s\S]*$/i) && !text.match(/^Chapter \d+/i)) {
                tableCellTexts.push(text);
              }
            }
          }
          if (tableCellTexts.length > 5) {
            isTableContent = true;
          }
        }
      }
      
      // Strategy 4: Fallback - find div with most paragraph content
      if (!contentEl && !isTableContent) {
        const candidates = document.querySelectorAll('div');
        let maxParagraphs = 0;
        for (const candidate of candidates) {
          const paragraphs = candidate.querySelectorAll('p');
          if (paragraphs.length > maxParagraphs && paragraphs.length > 5) {
            const text = candidate.textContent || '';
            if (text.length > 200) {
              maxParagraphs = paragraphs.length;
              contentEl = candidate;
            }
          }
        }
      }
      
      // Handle table cell content separately
      if (isTableContent && tableCellTexts.length > 0) {
        // Process table cell texts directly
        const text = tableCellTexts.join('\n\n').trim();
        return {
          content: text,
          images: []
        };
      }
      
      if (!contentEl) {
        return { content: '', images: [] };
      }
      
      // Clone to avoid modifying the original
      const clone = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, nav, footer, .nav, .navigation, .ul-list7, header, .header, .chapter-start, .chapter-end, .top, .error, .tips');
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
        /^Visit and read more novel to help us update chapter quickly\.$/i,
        /^Thank you so much!$/i,
        /^Use arrow keys/i,
        /^Report chapter$/i
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

    // DEBUG: Log what content we extracted (only if debug enabled)
    if (debug) {
      console.log(`[DEBUG scrapeChapter] Extracted content length: ${content.length}`);
      console.log(`[DEBUG scrapeChapter] First 500 chars of content: ${content.substring(0, 500)}`);
      if (content.length === 0) {
        console.log('[DEBUG scrapeChapter] WARNING: No content extracted!');
      }
    }

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
 * Returns whether this site uses Cloudflare protection.
 */
export function isCloudflarePage() {
  return true; // NovelLive uses Cloudflare
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
