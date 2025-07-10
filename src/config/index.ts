import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import readline from 'readline';
import os from 'os';

const configSchema = z.object({
  confluenceBaseUrl: z.string().url(),
  confluenceEmail: z.string().email(),
  confluenceApiToken: z.string().min(1),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  rateLimitRequests: z.number().int().positive().default(100),
  rateLimitWindowMs: z.number().int().positive().default(60000),
  tokenExpiryDate: z.string().datetime().optional(),
  lastValidated: z.string().datetime().optional(),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigManager {
  private readonly configPath: string;
  private config: Config | null = null;

  constructor(configDir?: string) {
    if (configDir) {
      this.configPath = path.join(configDir, 'config.json');
    } else {
      // Use home directory for global configuration
      const homeDir = os.homedir();
      this.configPath = path.join(homeDir, '.mcp-confluence-config.json');
    }
  }

  async loadConfig(): Promise<Config> {
    if (this.config) {
      return this.config;
    }

    try {
      if (await fs.pathExists(this.configPath)) {
        const configData = await fs.readJson(this.configPath);
        this.config = configSchema.parse(configData);
        return this.config;
      }
    } catch (error: any) {
      console.error('Error loading configuration:', error.message);
    }

    // Configuration does not exist or is invalid - throw error
    throw new Error('No valid configuration found. Use the setup_confluence tool for configuration.');
  }

  private async setupInteractiveConfig(): Promise<Config> {
    console.log('\\n🔧 Confluence MCP Server Setup');
    console.log('===============================\\n');
    console.log('Welcome! This server requires a Confluence configuration.');
    console.log('Please enter the following information:\\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = promisify(rl.question).bind(rl);

    try {
      const confluenceBaseUrl = (await question('Confluence Base URL (e.g. https://your-domain.atlassian.net): ')) as unknown as string;
      const confluenceEmail = (await question('Your email address: ')) as unknown as string;
      const confluenceApiToken = (await question('Your API token: ')) as unknown as string;
      const logLevelInput = (await question('Log Level (debug/info/warn/error) [info]: ')) as unknown as string;
      const logLevel = logLevelInput || 'info';

      const config: Config = {
        confluenceBaseUrl: confluenceBaseUrl.trim(),
        confluenceEmail: confluenceEmail.trim(),
        confluenceApiToken: confluenceApiToken.trim(),
        logLevel: logLevel.trim() as any,
        rateLimitRequests: 100,
        rateLimitWindowMs: 60000,
      };

      // Configuration validation
      const validatedConfig = configSchema.parse(config);
      
      console.log('\\n🔍 Testing configuration...');
      const isValid = await this.validateConfig(validatedConfig);
      
      if (isValid) {
        validatedConfig.lastValidated = new Date().toISOString();
        await this.saveConfig(validatedConfig);
        console.log('✅ Configuration successfully saved!');
        return validatedConfig;
      } else {
        console.log('❌ Configuration invalid. Please try again.');
        return await this.setupInteractiveConfig();
      }
    } finally {
      rl.close();
    }
  }

  async validateConfig(config: Config): Promise<boolean> {
    try {
      // Temporärer Confluence-Client für Test
      const axios = (await import('axios')).default;
      const auth = Buffer.from(`${config.confluenceEmail}:${config.confluenceApiToken}`).toString('base64');
      
      const response = await axios.get(`${config.confluenceBaseUrl}/wiki/rest/api/user/current`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return response.status === 200;
    } catch (error: any) {
      console.error('Validierungsfehler:', error.response?.data?.message || error.message);
      return false;
    }
  }

  async saveConfig(config: Config): Promise<void> {
    await fs.writeJson(this.configPath, config, { spaces: 2 });
    this.config = config;
  }

  async updateToken(newToken: string): Promise<void> {
    if (!this.config) {
      throw new Error('Keine Konfiguration geladen');
    }

    const updatedConfig = {
      ...this.config,
      confluenceApiToken: newToken,
      tokenExpiryDate: undefined,
      lastValidated: new Date().toISOString(),
    };

    console.log('🔍 Testing new token...');
    const isValid = await this.validateConfig(updatedConfig);
    
    if (isValid) {
      await this.saveConfig(updatedConfig);
      console.log('✅ Token successfully updated!');
    } else {
      throw new Error('New token is invalid');
    }
  }

  async isTokenExpired(): Promise<boolean> {
    if (!this.config || !this.config.tokenExpiryDate) {
      return false;
    }

    const expiryDate = new Date(this.config.tokenExpiryDate);
    const now = new Date();
    const daysBefore = 7; // 7 Tage vor Ablauf warnen
    
    return now >= new Date(expiryDate.getTime() - daysBefore * 24 * 60 * 60 * 1000);
  }

  async requestTokenRenewal(): Promise<void> {
    console.log('⚠️  Your API token has expired or will expire soon.');
    console.log('Please create a new token in your Atlassian account:');
    console.log('https://id.atlassian.com/manage-profile/security/api-tokens\\n');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = promisify(rl.question).bind(rl);

    try {
      const newToken = (await question('New API token: ')) as unknown as string;
      await this.updateToken(newToken.trim());
    } finally {
      rl.close();
    }
  }

  getConfig(): Config {
    if (!this.config) {
      throw new Error('Konfiguration nicht geladen. Rufen Sie loadConfig() auf.');
    }
    return this.config;
  }

  async ensureValidConfig(): Promise<Config> {
    const config = await this.loadConfig();
    
    // Check if token has expired
    if (await this.isTokenExpired()) {
      await this.requestTokenRenewal();
      return this.getConfig();
    }

    // Prüfe ob letzte Validierung zu lange her ist (24 Stunden)
    const lastValidated = config.lastValidated ? new Date(config.lastValidated) : new Date(0);
    const now = new Date();
    const hoursOld = (now.getTime() - lastValidated.getTime()) / (1000 * 60 * 60);
    
    if (hoursOld > 24) {
      console.log('🔍 Validating configuration...');
      const isValid = await this.validateConfig(config);
      
      if (isValid) {
        config.lastValidated = new Date().toISOString();
        await this.saveConfig(config);
      } else {
        console.log('❌ Token is no longer valid.');
        await this.requestTokenRenewal();
        return this.getConfig();
      }
    }

    return config;
  }
}

// Globale Instanz für einfachen Zugriff
export const configManager = new ConfigManager();