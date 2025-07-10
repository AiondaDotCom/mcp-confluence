import { Config } from '../config/index.js';

export class ConfluenceAuth {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  getAuthHeaders(): Record<string, string> {
    const auth = Buffer.from(`${this.config.confluenceEmail}:${this.config.confluenceApiToken}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  getBaseUrl(): string {
    return this.config.confluenceBaseUrl;
  }

  getConfig(): Config {
    return this.config;
  }
}