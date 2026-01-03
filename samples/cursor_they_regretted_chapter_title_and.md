# They-regretted chapter title and TOC padding
_Exported on 1/3/2026 at 10:36:42 PST from Cursor (2.3.15)_

---

**User**

Review the current chapter number implementation in @src/scraper/ScraperEngine.js and @src/plugins/www.wordycrown.com.js . Given the current implementation, scan through all the chapters for "they-regretted" and update the chapter title and the TOC.md file to use the appropriate padding.

---

**Cursor**

Reviewing the chapter number implementation and scanning "they-regretted" chapters to update titles and TOC.md with consistent 4-digit padding.


Checking a few chapter files to see the current title format:


Reading more chapter files to understand the formatting:


Chapter 10 shows `1.001` but should be `1.0010` (4-digit padding). Creating a script to scan all chapters and update titles and TOC to use consistent 4-digit padding.


Creating a script to normalize chapter numbers with proper 4-digit padding. Reading books.json to get all chapter data:


Creating a script to normalize chapter numbers:


```javascript
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, 'content', 'they-regretted');
const BOOKS_JSON = path.join(__dirname, 'data', 'books.json');

/**
 * Normalize chapter number to proper format with 4-digit padding
 * Format: {volume}.{chapter_padded} or {volume}.{chapter_padded}{part}
 * 
 * @param {number} chapterNumber - The chapter number (e.g., 1.001, 1.00791, 2.00011)
 * @returns {string} - Normalized chapter number string (e.g., "1.0010", "1.00791", "2.00011")
 */
function normalizeChapterNumber(chapterNumber) {
  if (chapterNumber === null || chapterNumber === undefined) {
    return null;
  }
  
  const numStr = chapterNumber.toString();
  
  // Check if it has a decimal point
  if (!numStr.includes('.')) {
    // Integer chapter number - assume volume 1
    return `1.${parseInt(numStr, 10).toString().padStart(4, '0')}`;
  }
  
  const parts = numStr.split('.');
  const volume = parts[0];
  const decimalPart = parts[1];
  
  // Determine if there's a part number (more than 4 digits after decimal)
  if (decimalPart.length > 4) {
    // Has part number - format as volume.chapterPadded + part
    // Extract first 4 digits as chapter, rest as part
    const chapterPadded = decimalPart.substring(0, 4);
    const part = decimalPart.substring(4);
    return `${volume}.${chapterPadded}${part}`;
  } else {
    // No part number - ensure 4-digit padding
    const chapterPadded = decimalPart.padEnd(4, '0');
    return `${volume}.${chapterPadded}`;
  }
}

/**
 * Extract chapter number from title line
 * Format: "# {number} {title}"
 */
function extractChapterNumberFromTitle(titleLine) {
  const match = titleLine.match(/^#\s+(\d+\.\d+)\s+(.+)$/);
  if (match) {
    return {
      number: parseFloat(match[1]),
      title: match[2]
    };
  }
  return null;
}

async function main() {
  // Load book data
  const booksData = await fs.readJson(BOOKS_JSON);
  const book = booksData.books.find(b => b.id === 'they-regretted');
  
  if (!book) {
    throw new Error('Book "they-regretted" not found');
  }
  
  console.log(`Processing ${book.chapters.length} chapters...\n`);
  
  const updates = [];
  
  // Process each chapter
  for (const chapter of book.chapters) {
    const chapterPath = chapter.path;
    const chapterNumber = chapter.number;
    
    // Normalize chapter number
    const normalized = normalizeChapterNumber(chapterNumber);
    
    if (!normalized) {
      console.warn(`⚠ Skipping chapter with null number: ${chapterPath}`);
      continue;
    }
    
    // Sanitize path for filename
    const sanitizedPath = chapterPath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'index';
    
    const filePath = path.join(CONTENT_DIR, `${sanitizedPath}.md`);
    
    if (!(await fs.pathExists(filePath))) {
      console.warn(`⚠ File not found: ${filePath}`);
      continue;
    }
    
    // Read file
    let content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Find title line (first line starting with #)
    let titleLineIndex = -1;
    let titleMatch = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('# ')) {
        titleMatch = extractChapterNumberFromTitle(line);
        if (titleMatch) {
          titleLineIndex = i;
          break;
        }
      }
    }
    
    if (titleLineIndex === -1) {
      console.warn(`⚠ Could not find title line in: ${filePath}`);
      continue;
    }
    
    const currentNumberStr = titleMatch.number.toString();
    const expectedNumberStr = normalized;
    
    // Check if update is needed
    if (currentNumberStr !== expectedNumberStr && parseFloat(currentNumberStr) === parseFloat(expectedNumberStr)) {
      // Numbers are equivalent but formatting differs (e.g., 1.001 vs 1.0010)
      const newTitleLine = `# ${expectedNumberStr} ${titleMatch.title}`;
      lines[titleLineIndex] = newTitleLine;
      content = lines.join('\n');
      
      await fs.writeFile(filePath, content, 'utf8');
      updates.push({
        file: path.basename(filePath),
        old: currentNumberStr,
        new: expectedNumberStr
      });
      
      console.log(`✓ Updated ${path.basename(filePath)}: ${currentNumberStr} → ${expectedNumberStr}`);
    }
  }
  
  console.log(`\n✓ Updated ${updates.length} chapter file(s).`);
  console.log('\nRegenerating TOC...');
  
  // Now regenerate TOC by calling the generateTOC method
  // We'll need to import and use the ScraperEngine
  const { ScraperEngine } = await import('./src/scraper/ScraperEngine.js');
  const engine = new ScraperEngine();
  await engine.generateTOC('they-regretted');
  
  console.log('\n✓ Done!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

```

Running the script to fix chapter padding:


Verifying updates and checking the TOC:


Checking a few more chapters, especially those with parts, to ensure consistency:


All chapters are properly formatted. Cleaning up the temporary script:


## Summary

1. Updated chapter titles with 4-digit padding. Seven files were fixed:
   - Chapter 10: `1.001` → `1.0010`
   - Chapter 20: `1.002` → `1.0020`
   - Chapter 30: `1.003` → `1.0030`
   - Chapter 40: `1.004` → `1.0040`
   - Chapter 50: `1.005` → `1.0050`
   - Chapter 60: `1.006` → `1.0060`
   - Chapter 70: `1.007` → `1.0070`

2. Verified chapters with parts:
   - Chapter 79 Part 1: `1.00791` (correct, 4-digit chapter + part)
   - Volume 2 Chapter 1 Part 1: `2.00011` (correct, 4-digit chapter + part)

3. Regenerated TOC.md with consistent formatting:
   - Displays the decimal portion with 4-digit padding
   - Volume 1: `0010`, `0020`, etc.
   - Volume 1 with parts: `00791`, `00801`, etc.
   - Volume 2: `00011`, `00012`, etc.

All chapters now use the format `{volume}.{chapter_padded}` where `chapter_padded` is exactly 4 digits, with part numbers appended for multi-part chapters. The TOC correctly displays these numbers by extracting and formatting the decimal portion.

