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

export class RootSite {
  constructor(domain, description, credentials = null) {
    this.domain = domain;
    this.description = description;
    this.credentials = credentials;
  }

  static fromJSON(json) {
    return new RootSite(
      json.domain,
      json.description,
      json.credentials || null
    );
  }

  toJSON() {
    return {
      domain: this.domain,
      description: this.description,
      ...(this.credentials && { credentials: this.credentials })
    };
  }

  validate() {
    if (!this.domain || typeof this.domain !== 'string') {
      throw new Error('RootSite must have a valid domain');
    }
    if (!this.description || typeof this.description !== 'string') {
      throw new Error('RootSite must have a valid description');
    }
    if (this.credentials && typeof this.credentials !== 'object') {
      throw new Error('RootSite credentials must be an object');
    }
    return true;
  }
}


