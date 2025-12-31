# Web Scraper Application

A plugin-based Node.js application for scraping chapter-based content from websites. Each root domain has its own plugin that handles site-specific scraping logic.

## Features

- **Plugin Architecture**: Each root domain has its own plugin file for custom scraping logic
- **Sequential Navigation**: Chapters are scraped in order by following "next chapter" links
- **Resume Support**: Automatically resumes from the last scraped chapter
- **Content Detection**: Prevents getting stuck on empty/placeholder pages
- **Multiple Content Types**: Supports both text and image-based content
- **Authentication**: Optional login support for sites requiring credentials

## Installation

```bash
npm install
```

## Usage

### Add a Root Site

```bash
npm start add-site example.com "Example site description"
```

With credentials:
```bash
npm start add-site example.com "Example site" --username myuser --password mypass
```

### Add a Book

```bash
npm start add-book my-book-id "https://www.example.com/book/chapter-1"
```

The URL should point to the first chapter of the book. The root site domain, path, and plugin will be automatically extracted from the URL. The plugin is determined by the domain (1:1 relationship between site and plugin).

### List Sites and Books

```bash
npm start list-sites
npm start list-books
```

### Scrape a Book

```bash
npm start scrape my-book-id
```

### Resume Scraping

```bash
npm start resume my-book-id
```

## Project Structure

```
scraper/
├── src/
│   ├── cli/              # CLI interface
│   ├── models/           # Data models (Book, RootSite)
│   ├── scraper/          # Scraper engine and plugin loader
│   ├── data/             # Data manager for JSON files
│   └── plugins/          # Plugin files (one per domain)
├── data/                 # JSON data files
│   ├── root-sites.json
│   └── books.json
└── content/              # Scraped markdown files
    └── {book-id}/
        └── {chapter}.md
```

## Creating a Plugin

1. Copy `src/plugins/base.js` to `src/plugins/{domain}.js`
2. Implement the required methods:
   - `getNextChapterUrl(page)` - Extract next chapter URL from current page
   - `hasContent(page)` - Detect if page has actual content
   - `scrapeChapter(url, page, options)` - Scrape chapter content
   - `getContentType()` - Return 'text' or 'image'
   - `login(credentials, page)` - Optional authentication

See `src/plugins/example.com.js` for a complete example.

## Data Models

### RootSite
- `domain`: Root domain (e.g., "example.com")
- `description`: Site description
- `credentials`: Optional { username, password }

### Book
- `id`: Unique book identifier
- `rootSite`: Root site domain
- `rootPath`: Starting path for the book
- `plugin`: Plugin domain to use
- `lastPathScraped`: Last chapter path scraped (for resuming)
- `chapters`: Array of all scraped chapter paths

## License

ISC


