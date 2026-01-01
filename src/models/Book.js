export class Book {
  constructor(id, rootSite, rootPath, plugin, lastPathScraped = null, chapters = [], title = null, startingPath = null) {
    this.id = id;
    this.rootSite = rootSite;
    this.rootPath = rootPath;
    this.plugin = plugin;
    this.lastPathScraped = lastPathScraped;
    this.title = title;
    this.startingPath = startingPath || rootPath; // Default to rootPath for backward compatibility
    // Chapters can be array of strings (legacy) or array of {path, number} objects
    this.chapters = Array.isArray(chapters) ? chapters : [];
  }

  static fromJSON(json) {
    // Convert chapters from JSON (handle both legacy string format and new object format)
    const chapters = (json.chapters || []).map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return new Book(
      json.id,
      json.rootSite,
      json.rootPath,
      json.plugin,
      json.lastPathScraped || null,
      chapters,
      json.title || null,
      json.startingPath || null
    );
  }

  toJSON() {
    // Convert chapters to JSON format (preserve structure)
    const chaptersJSON = this.chapters.map(ch => {
      if (typeof ch === 'string') {
        return ch; // Legacy format
      }
      return { path: ch.path, number: ch.number };
    });

    return {
      id: this.id,
      rootSite: this.rootSite,
      rootPath: this.rootPath,
      plugin: this.plugin,
      lastPathScraped: this.lastPathScraped,
      chapters: chaptersJSON,
      ...(this.title && { title: this.title }),
      ...(this.startingPath && { startingPath: this.startingPath })
    };
  }

  validate() {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Book must have a valid id');
    }
    if (!this.rootSite || typeof this.rootSite !== 'string') {
      throw new Error('Book must have a valid rootSite');
    }
    if (!this.rootPath || typeof this.rootPath !== 'string') {
      throw new Error('Book must have a valid rootPath');
    }
    if (!this.plugin || typeof this.plugin !== 'string') {
      throw new Error('Book must have a valid plugin');
    }
    if (this.lastPathScraped && typeof this.lastPathScraped !== 'string') {
      throw new Error('Book lastPathScraped must be a string or null');
    }
    if (!Array.isArray(this.chapters)) {
      throw new Error('Book chapters must be an array');
    }
    if (this.title !== null && this.title !== undefined && typeof this.title !== 'string') {
      throw new Error('Book title must be a string or null');
    }
    if (this.startingPath !== null && this.startingPath !== undefined && typeof this.startingPath !== 'string') {
      throw new Error('Book startingPath must be a string or null');
    }
    return true;
  }

  addChapter(chapterPath, chapterNumber = null) {
    // Check if chapter already exists
    if (this.hasChapter(chapterPath)) {
      return;
    }

    if (chapterNumber !== null) {
      // Store as object with path and number
      this.chapters.push({ path: chapterPath, number: chapterNumber });
      // Sort chapters by number
      this.chapters.sort((a, b) => {
        if (typeof a === 'string') return 1; // Legacy string entries go to end
        if (typeof b === 'string') return -1;
        return a.number - b.number;
      });
    } else {
      // Legacy: store as string
      this.chapters.push(chapterPath);
    }
  }

  hasChapter(chapterPath) {
    return this.chapters.some(ch => {
      if (typeof ch === 'string') {
        return ch === chapterPath;
      }
      return ch.path === chapterPath;
    });
  }

  getChapterPath(chapter) {
    return typeof chapter === 'string' ? chapter : chapter.path;
  }

  getChapterNumber(chapter) {
    return typeof chapter === 'string' ? null : chapter.number;
  }

  getChaptersSorted() {
    // Return chapters sorted by number (if available), otherwise maintain order
    return [...this.chapters].sort((a, b) => {
      const numA = this.getChapterNumber(a);
      const numB = this.getChapterNumber(b);
      if (numA === null && numB === null) return 0;
      if (numA === null) return 1;
      if (numB === null) return -1;
      return numA - numB;
    });
  }
}


