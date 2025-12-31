import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGINS_DIR = path.join(__dirname, '../plugins');

export class PluginLoader {
  constructor() {
    // Ensure plugins directory exists
    fs.ensureDirSync(PLUGINS_DIR);
  }

  async loadPlugin(domain) {
    const pluginPath = path.join(PLUGINS_DIR, `${domain}.js`);
    
    if (!(await fs.pathExists(pluginPath))) {
      throw new Error(`Plugin for domain ${domain} not found at ${pluginPath}`);
    }

    try {
      const plugin = await import(`file://${pluginPath}`);
      this.validatePlugin(plugin);
      return plugin;
    } catch (error) {
      throw new Error(`Failed to load plugin for ${domain}: ${error.message}`);
    }
  }

  validatePlugin(plugin) {
    const requiredMethods = [
      'getNextChapterUrl',
      'hasContent',
      'scrapeChapter',
      'getContentType'
    ];

    for (const method of requiredMethods) {
      if (typeof plugin[method] !== 'function') {
        throw new Error(`Plugin is missing required method: ${method}`);
      }
    }

    // Validate getContentType returns a valid value
    const contentType = plugin.getContentType();
    if (contentType !== 'text' && contentType !== 'image') {
      throw new Error(`Plugin getContentType() must return 'text' or 'image', got: ${contentType}`);
    }

    return true;
  }

  listAvailablePlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) {
      return [];
    }
    
    return fs.readdirSync(PLUGINS_DIR)
      .filter(file => file.endsWith('.js'))
      .map(file => file.replace('.js', ''));
  }
}


