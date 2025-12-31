# Testing Guide

This guide will help you test the scraper application.

## Prerequisites

1. **Install dependencies** (if not already done):
```bash
npm install
```

2. **Verify installation**:
```bash
npm start --help
```

You should see the CLI help menu with all available commands.

## Testing Steps

### 1. Test CLI Commands (Without Scraping)

#### List Sites and Books (should be empty initially)
```bash
npm start list-sites
npm start list-books
```

#### Add a Root Site
```bash
npm start add-site example.com "Example website for testing"
```

Or with credentials:
```bash
npm start add-site example.com "Example website" --username testuser --password testpass
```

#### Verify the site was added
```bash
npm start list-sites
```

#### Add a Book
```bash
npm start add-book test-book "https://example.com/book/chapter-1"
```

**Note:** The plugin is automatically determined from the domain. For example, a URL with domain `example.com` will use the plugin `src/plugins/example.com.js`. The plugin name must match the domain (1:1 relationship).

#### Verify the book was added
```bash
npm start list-books
```

### 2. Test with a Real Website

To test actual scraping, you'll need to:

1. **Create or modify a plugin** for your target website:
   - Copy `src/plugins/example.com.js` to `src/plugins/yourdomain.com.js`
   - Update the selectors and logic for your target site
   - See the plugin documentation in `src/plugins/base.js` for the required interface

2. **Add the root site**:
```bash
npm start add-site yourdomain.com "Description of the site"
```

3. **Add a book with the first chapter URL**:
```bash
npm start add-book my-book "https://yourdomain.com/book/chapter-1"
```

The plugin will be automatically determined from the domain (`yourdomain.com`).

4. **Test scraping**:
```bash
npm start scrape my-book
```

### 3. Testing Plugin Development

You can test plugins incrementally:

1. **Start with a simple test site** (like a blog or documentation site)
2. **Create a minimal plugin** that implements:
   - `getNextChapterUrl(page)` - Find the "next" link
   - `hasContent(page)` - Check if page has content
   - `scrapeChapter(url, page, options)` - Extract title and content
   - `getContentType()` - Return 'text' or 'image'

3. **Test the plugin** by running:
```bash
npm start scrape your-book-id
```

### 4. Testing Edge Cases

#### Test Resume Functionality
1. Start scraping a book
2. Interrupt it (Ctrl+C)
3. Resume:
```bash
npm start resume your-book-id
```

#### Test Content Detection
- Create a plugin that returns `false` from `hasContent()` for empty pages
- Verify that `lastPathScraped` is not updated when encountering empty pages

#### Test Sequential Navigation
- Verify that chapters are scraped in order
- Check that the scraper stops when it encounters an already-scraped chapter

### 5. Verify Output

After scraping, check:
- **Content files**: `content/{book-id}/` directory should contain markdown files
- **Book metadata**: `data/books.json` should have updated `lastPathScraped` and `chapters` array
- **Console output**: Should show progress messages

### 6. Debugging Tips

1. **Check plugin loading**:
   - Ensure plugin file exists: `src/plugins/{domain}.js`
   - Verify all required methods are exported
   - Check for syntax errors

2. **Check data files**:
   - `data/root-sites.json` - Verify root site exists
   - `data/books.json` - Verify book configuration

3. **Run with verbose output**:
   - The scraper logs progress to console
   - Watch for error messages

4. **Test selectors manually**:
   - Use browser DevTools to verify CSS selectors work
   - Test in Puppeteer's headless browser if needed

## Example Test Workflow

```bash
# 1. Install dependencies
npm install

# 2. Add a test site
npm start add-site example.com "Example site"

# 3. Add a test book (plugin automatically determined from domain)
npm start add-book test "https://example.com/page1"

# 4. List to verify
npm start list-books

# 5. Try scraping (will use example.com plugin)
npm start scrape test

# 6. Check output
ls -la content/test/
cat data/books.json
```

## Testing with Mock/Test Sites

For development, you can:

1. **Use a local test server**:
   - Create a simple HTML site with chapter navigation
   - Run it locally (e.g., `python -m http.server 8000`)
   - Use `localhost:8000` as the domain

2. **Use public test sites**:
   - Sites like `example.com`, `httpbin.org`, or documentation sites
   - Create appropriate plugins for them

## Troubleshooting

- **"Plugin not found"**: Ensure plugin file exists in `src/plugins/{domain}.js`
- **"Root site not found"**: Add the site first with `add-site`
- **"No content detected"**: Check your `hasContent()` implementation
- **"No next chapter found"**: Verify `getNextChapterUrl()` selector matches the site structure
- **Puppeteer errors**: Ensure Chrome/Chromium is available (Puppeteer will download it automatically)
