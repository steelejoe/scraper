export class Book {
  constructor(id, rootSite, rootPath, plugin, lastPathScraped = null, chapters = []) {
    this.id = id;
    this.rootSite = rootSite;
    this.rootPath = rootPath;
    this.plugin = plugin;
    this.lastPathScraped = lastPathScraped;
    this.chapters = Array.isArray(chapters) ? chapters : [];
  }

  static fromJSON(json) {
    return new Book(
      json.id,
      json.rootSite,
      json.rootPath,
      json.plugin,
      json.lastPathScraped || null,
      json.chapters || []
    );
  }

  toJSON() {
    return {
      id: this.id,
      rootSite: this.rootSite,
      rootPath: this.rootPath,
      plugin: this.plugin,
      lastPathScraped: this.lastPathScraped,
      chapters: this.chapters
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
    return true;
  }

  addChapter(chapterPath) {
    if (!this.chapters.includes(chapterPath)) {
      this.chapters.push(chapterPath);
    }
  }

  hasChapter(chapterPath) {
    return this.chapters.includes(chapterPath);
  }
}


