/**
 * Sanitize a chapter path for use as a filename (matches ScraperEngine logic).
 * e.g. "/book/chapter-1" -> "book_chapter_1"
 */
export function sanitizePathForFilename(chapterPath) {
  return chapterPath
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'index';
}
