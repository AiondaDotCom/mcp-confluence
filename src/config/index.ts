import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import readline from 'readline';

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
    const baseDir = configDir || process.cwd();
    this.configPath = path.join(baseDir, 'config.json');
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
    throw new Error('No valid config.json found. Use the setup_confluence tool for configuration.');
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
      const confluenceBaseUrl = (await question('Confluence Base URL (z.B. https://your-domain.atlassian.net): ')) as unknown as string;
      const confluenceEmail = (await question('Ihre E-Mail-Adresse: ')) as unknown as string;
      const confluenceApiToken = (await question('Ihr API-Token: ')) as unknown as string;
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

      // Validierung der Konfiguration
      const validatedConfig = configSchema.parse(config);
      
      console.log('\\n🔍 Teste Konfiguration...');
      const isValid = await this.validateConfig(validatedConfig);
      
      if (isValid) {
        validatedConfig.lastValidated = new Date().toISOString();
        await this.saveConfig(validatedConfig);
        console.log('✅ Konfiguration erfolgreich gespeichert!');
        return validatedConfig;
      } else {
        console.log('❌ Konfiguration ungültig. Bitte versuchen Sie es erneut.');
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

    console.log('🔍 Teste neuen Token...');
    const isValid = await this.validateConfig(updatedConfig);
    
    if (isValid) {
      await this.saveConfig(updatedConfig);
      console.log('✅ Token erfolgreich aktualisiert!');
    } else {
      throw new Error('Neuer Token ist ungültig');
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
    console.log('⚠️  Ihr API-Token ist abgelaufen oder wird bald ablaufen.');
    console.log('Bitte erstellen Sie einen neuen Token in Ihrem Atlassian-Konto:');
    console.log('https://id.atlassian.com/manage-profile/security/api-tokens\\n');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = promisify(rl.question).bind(rl);

    try {
      const newToken = (await question('Neuer API-Token: ')) as unknown as string;
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
    
    // Prüfe ob Token abgelaufen ist
    if (await this.isTokenExpired()) {
      await this.requestTokenRenewal();
      return this.getConfig();
    }

    // Prüfe ob letzte Validierung zu lange her ist (24 Stunden)
    const lastValidated = config.lastValidated ? new Date(config.lastValidated) : new Date(0);
    const now = new Date();
    const hoursOld = (now.getTime() - lastValidated.getTime()) / (1000 * 60 * 60);
    
    if (hoursOld > 24) {
      console.log('🔍 Validiere Konfiguration...');
      const isValid = await this.validateConfig(config);
      
      if (isValid) {
        config.lastValidated = new Date().toISOString();
        await this.saveConfig(config);
      } else {
        console.log('❌ Token ist nicht mehr gültig.');
        await this.requestTokenRenewal();
        return this.getConfig();
      }
    }

    return config;
  }
}

// Globale Instanz für einfachen Zugriff
export const configManager = new ConfigManager();