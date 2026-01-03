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

export class Book {
  constructor(id, rootSite, rootPath, plugin, lastPathScraped = null, chapters = [], title = null, startingPath = null, contentType = null) {
    this.id = id;
    this.rootSite = rootSite;
    this.rootPath = rootPath;
    this.plugin = plugin;
    this.lastPathScraped = lastPathScraped;
    this.title = title;
    this.startingPath = startingPath || rootPath; // Default to rootPath for backward compatibility
    // Chapters can be array of strings (legacy) or array of {path, number} objects
    this.chapters = Array.isArray(chapters) ? chapters : [];
    this.contentType = contentType; // 'text' or 'image' or null
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
      json.startingPath || null,
      json.contentType || null
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
      ...(this.startingPath && { startingPath: this.startingPath }),
      ...(this.contentType && { contentType: this.contentType })
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
    if (this.contentType !== null && this.contentType !== undefined && this.contentType !== 'text' && this.contentType !== 'image') {
      throw new Error('Book contentType must be "text", "image", or null');
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


