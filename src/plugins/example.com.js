/**
 * Example Plugin for example.com
 * 
 * FAKE IMPLEMENTATION FOR TESTING:
 * This plugin returns fake content to demonstrate how the scraper stores data.
 * It will generate 5 fake chapters with test content.
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
    
    // Extract chapter number from URL if possible
    const chapterMatch = currentUrl.match(/chapter[_-]?(\d+)/i);
    let chapterNum = 1;
    
    if (chapterMatch) {
      chapterNum = parseInt(chapterMatch[1], 10);
    } else {
      // Try to extract from path
      const pathMatch = currentUrl.match(/\/(\d+)/);
      if (pathMatch) {
        chapterNum = parseInt(pathMatch[1], 10);
      }
    }
    
    // Return next chapter URL (limit to 5 chapters for testing)
    if (chapterNum < 5) {
      const nextNum = chapterNum + 1;
      // Try to maintain the URL structure
      if (currentUrl.includes('/chapter-')) {
        return currentUrl.replace(/chapter[_-]?\d+/i, `chapter-${nextNum}`);
      } else if (currentUrl.includes('/chapter_')) {
        return currentUrl.replace(/chapter[_-]?\d+/i, `chapter_${nextNum}`);
      } else {
        // Generic next URL
        const baseUrl = currentUrl.split('?')[0].replace(/\/\d+$/, '');
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
    // Extract chapter number from URL for fake content
    const chapterMatch = url.match(/chapter[_-]?(\d+)/i);
    let chapterNum = 1;
    
    if (chapterMatch) {
      chapterNum = parseInt(chapterMatch[1], 10);
    } else {
      const pathMatch = url.match(/\/(\d+)/);
      if (pathMatch) {
        chapterNum = parseInt(pathMatch[1], 10);
      }
    }

    // Generate fake title
    const title = `Chapter ${chapterNum}: The Journey Continues`;

    // Generate fake content with some variety
    const fakeContent = `This is fake content for testing purposes. This is Chapter ${chapterNum} of the example book.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

In this chapter, our hero faces new challenges and discovers important information about the quest. The narrative continues to develop as we explore the world of this fictional story.

**Key Points:**
- This is a test chapter
- Content is generated automatically
- Chapter number: ${chapterNum}
- URL: ${url}

The story progresses with each chapter, building upon previous events and introducing new elements to keep the reader engaged. This is purely for demonstration purposes to show how the scraper stores content.

More content follows here to make it look realistic. The text continues for several paragraphs to demonstrate how longer chapters would be stored. Each chapter in a real scenario would contain the actual scraped content from the website.

The end of this fake chapter content.`;

    return {
      title,
      content: fakeContent,
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

