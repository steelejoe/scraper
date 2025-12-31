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


