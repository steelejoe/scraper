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
 * Example Plugin for example.com
 * 
 * FAKE IMPLEMENTATION FOR TESTING:
 * This plugin returns fake content to demonstrate how the scraper stores data.
 * It supports both forward and reverse scraping:
 * - Forward: Will generate chapters 1-5 going forward
 * - Reverse: Will generate chapters going backwards from the starting chapter number
 * - Supports both integer and decimal chapter numbers (e.g., 1.5, 2.3)
 * 
 * For real use, replace the selectors and logic with site-specific implementations.
 */

/**
 * Extracts the "next chapter" URL from the current page.
 * 
 * FAKE IMPLEMENTATION: Returns fake next chapter URLs for testing.
 */
export async function getNextChapterUrl(page) {
  try {
    const currentUrl = page.url();
    
    // Extract chapter number from URL if possible (supports decimals)
    const chapterMatch = currentUrl.match(/chapter[_-]?(\d+\.?\d*)/i);
    let chapterNum = 1;
    
    if (chapterMatch) {
      chapterNum = parseFloat(chapterMatch[1]);
    } else {
      // Try to extract from path (supports decimals)
      const pathMatch = currentUrl.match(/\/(\d+\.?\d*)/);
      if (pathMatch) {
        chapterNum = parseFloat(pathMatch[1]);
      }
    }
    
    // Return next chapter URL (limit to 5 chapters for testing)
    if (chapterNum < 5) {
      const nextNum = chapterNum + 1;
      // Try to maintain the URL structure
      if (currentUrl.includes('/chapter-')) {
        return currentUrl.replace(/chapter[_-]?\d+\.?\d*/i, `chapter-${nextNum}`);
      } else if (currentUrl.includes('/chapter_')) {
        return currentUrl.replace(/chapter[_-]?\d+\.?\d*/i, `chapter_${nextNum}`);
      } else {
        // Generic next URL
        const baseUrl = currentUrl.split('?')[0].replace(/\/\d+\.?\d*$/, '');
        return `${baseUrl}/${nextNum}`;
      }
    }
    
    return null; // No more chapters after 5
  } catch (error) {
    console.error('Error getting next chapter URL:', error);
    return null;
  }
}

/**
 * Extracts the "previous chapter" URL from the current page.
 * 
 * FAKE IMPLEMENTATION: Returns fake previous chapter URLs for testing.
 */
export async function getPreviousChapterUrl(page) {
  try {
    const currentUrl = page.url();
    
    // Extract chapter number from URL if possible (supports decimals)
    const chapterMatch = currentUrl.match(/chapter[_-]?(\d+\.?\d*)/i);
    let chapterNum = 1;
    
    if (chapterMatch) {
      chapterNum = parseFloat(chapterMatch[1]);
    } else {
      // Try to extract from path (supports decimals)
      const pathMatch = currentUrl.match(/\/(\d+\.?\d*)/);
      if (pathMatch) {
        chapterNum = parseFloat(pathMatch[1]);
      }
    }
    
    // Return previous chapter URL (must be greater than 0.1 to allow decimals)
    if (chapterNum > 0.1) {
      const prevNum = chapterNum - 1;
      // Try to maintain the URL structure
      if (currentUrl.includes('/chapter-')) {
        return currentUrl.replace(/chapter[_-]?\d+\.?\d*/i, `chapter-${prevNum}`);
      } else if (currentUrl.includes('/chapter_')) {
        return currentUrl.replace(/chapter[_-]?\d+\.?\d*/i, `chapter_${prevNum}`);
      } else {
        // Generic previous URL
        const baseUrl = currentUrl.split('?')[0].replace(/\/\d+\.?\d*$/, '');
        return `${baseUrl}/${prevNum}`;
      }
    }
    
    return null; // No previous chapter (this is chapter 1 or less)
  } catch (error) {
    console.error('Error getting previous chapter URL:', error);
    return null;
  }
}

/**
 * Detects if the current page has actual content.
 * 
 * FAKE IMPLEMENTATION: Always returns true for testing.
 */
export async function hasContent(page) {
  // For testing, always return true
  return true;
}

/**
 * Scrapes a single chapter.
 * 
 * FAKE IMPLEMENTATION: Returns fake content for testing.
 */
export async function scrapeChapter(url, page, options = {}) {
  try {
    // Use chapter number from options if provided (for reverse scraping)
    // Otherwise extract from URL
    let chapterNum = options.chapterNumber;
    
    if (chapterNum === undefined || chapterNum === null) {
      // Extract chapter number from URL (supports decimals)
      const chapterMatch = url.match(/chapter[_-]?(\d+\.?\d*)/i);
      
      if (chapterMatch) {
        chapterNum = parseFloat(chapterMatch[1]);
      } else {
        const pathMatch = url.match(/\/(\d+\.?\d*)/);
        if (pathMatch) {
          chapterNum = parseFloat(pathMatch[1]);
        } else {
          chapterNum = 1; // Default fallback
        }
      }
    }

    // Generate fake title (format nicely for decimals)
    const chapterNumStr = chapterNum % 1 === 0 ? chapterNum.toString() : chapterNum.toFixed(1);
    const title = `Chapter ${chapterNumStr}: The Journey Continues`;

    // Generate fake content with some variety
    const fakeContent = `This is fake content for testing purposes. This is Chapter ${chapterNumStr} of the example book.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

In this chapter, our hero faces new challenges and discovers important information about the quest. The narrative continues to develop as we explore the world of this fictional story.

**Key Points:**
- This is a test chapter
- Content is generated automatically
- Chapter number: ${chapterNumStr}
- URL: ${url}

The story progresses with each chapter, building upon previous events and introducing new elements to keep the reader engaged. This is purely for demonstration purposes to show how the scraper stores content.

More content follows here to make it look realistic. The text continues for several paragraphs to demonstrate how longer chapters would be stored. Each chapter in a real scenario would contain the actual scraped content from the website.

The end of this fake chapter content.`;

    return {
      title,
      content: fakeContent,
      chapterNumber: chapterNum, // Can be integer or decimal
      images: undefined // No images for text content type
    };
  } catch (error) {
    throw new Error(`Failed to scrape chapter at ${url}: ${error.message}`);
  }
}

/**
 * Returns the content type.
 */
export function getContentType() {
  return 'text'; // Change to 'image' if this plugin handles image-based content
}

/**
 * Optional: Handles authentication.
 */
export async function login(credentials, page) {
  if (!credentials || !credentials.username || !credentials.password) {
    return; // No credentials provided
  }

  try {
    // Adjust login URL and selectors based on the site
    await page.goto('https://example.com/login', { waitUntil: 'networkidle2' });
    
    await page.type('#username, input[name="username"]', credentials.username);
    await page.type('#password, input[name="password"]', credentials.password);
    
    await page.click('button[type="submit"], input[type="submit"], .login-button');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    
    // Verify login was successful (adjust as needed)
    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('.login-form, #login');
    });
    
    if (!isLoggedIn) {
      throw new Error('Login failed - still on login page');
    }
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
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

