import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListResourcesRequestSchema, 
  ListToolsRequestSchema, 
  ReadResourceRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { ConfluenceClient } from './confluence/client.js';
import { Config, configManager } from './config/index.js';
import { z } from 'zod';

export class ConfluenceMCPServer {
  private server: Server;
  private confluenceClient: ConfluenceClient | null = null;
  private config: Config | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-confluence-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async ensureConfigured(): Promise<void> {
    if (this.confluenceClient) {
      return; // Already configured
    }

    try {
      // Versuche Config zu laden ohne interaktives Setup
      this.config = await configManager.loadConfig();
      this.confluenceClient = new ConfluenceClient(this.config);
    } catch (error: any) {
      // Config nicht verfügbar oder ungültig
      throw new Error('Keine gültige Konfiguration gefunden. Bitte verwenden Sie das setup_confluence Tool um die Verbindung zu konfigurieren.');
    }
  }

  private setupHandlers() {
    // Tools-Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_confluence',
          description: 'Durchsucht Confluence-Inhalte mit CQL (Confluence Query Language)',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'CQL-Suchanfrage (z.B. "type=page AND space=DEMO")',
              },
              limit: {
                type: 'number',
                description: 'Maximale Anzahl der Ergebnisse (Standard: 25)',
                default: 25,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_page',
          description: 'Ruft eine spezifische Confluence-Seite ab',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: {
                type: 'string',
                description: 'ID der Confluence-Seite',
              },
              expand: {
                type: 'array',
                items: { type: 'string' },
                description: 'Zu erweiternde Felder (z.B. ["body.storage", "version"])',
              },
            },
            required: ['pageId'],
          },
        },
        {
          name: 'get_space',
          description: 'Ruft Informationen über einen Confluence-Bereich ab',
          inputSchema: {
            type: 'object',
            properties: {
              spaceKey: {
                type: 'string',
                description: 'Schlüssel des Confluence-Bereichs',
              },
            },
            required: ['spaceKey'],
          },
        },
        {
          name: 'list_spaces',
          description: 'Listet alle verfügbaren Confluence-Bereiche auf',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximale Anzahl der Ergebnisse (Standard: 25)',
                default: 25,
              },
            },
          },
        },
        {
          name: 'search_pages',
          description: 'Durchsucht Confluence-Seiten nach Titel oder Inhalt',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Suchbegriff für Titel oder Inhalt',
              },
              limit: {
                type: 'number',
                description: 'Maximale Anzahl der Ergebnisse (Standard: 25)',
                default: 25,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_recent_pages',
          description: 'Ruft die zuletzt geänderten Seiten ab',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximale Anzahl der Ergebnisse (Standard: 10)',
                default: 10,
              },
            },
          },
        },
        {
          name: 'setup_confluence',
          description: 'Konfiguriert oder rekonfiguriert die Confluence-Verbindung',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['setup', 'update_token', 'validate'],
                description: 'Aktion: setup (Erstkonfiguration), update_token (Token erneuern), validate (Konfiguration prüfen)',
              },
              confluenceBaseUrl: {
                type: 'string',
                description: 'Confluence Base URL (nur bei setup)',
              },
              confluenceEmail: {
                type: 'string',
                description: 'E-Mail-Adresse (nur bei setup)',
              },
              confluenceApiToken: {
                type: 'string',
                description: 'API-Token (bei setup und update_token)',
              },
            },
            required: ['action'],
          },
        },
      ],
    }));

    // Resources-Handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'confluence://spaces',
          name: 'Confluence Spaces',
          description: 'Liste aller verfügbaren Confluence-Bereiche',
          mimeType: 'application/json',
        },
        {
          uri: 'confluence://recent-pages',
          name: 'Recent Pages',
          description: 'Kürzlich aktualisierte Seiten',
          mimeType: 'application/json',
        },
        {
          uri: 'confluence://user',
          name: 'Current User',
          description: 'Informationen über den aktuellen Benutzer',
          mimeType: 'application/json',
        },
      ],
    }));

    // Tool-Aufrufe
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Spezielle Behandlung für setup_confluence - keine Konfiguration erforderlich
        if (name === 'setup_confluence') {
          return await this.handleSetupConfluence(args);
        }

        // Für alle anderen Tools: Stelle sicher, dass Konfiguration vorhanden ist
        await this.ensureConfigured();

        switch (name) {
          case 'search_confluence':
            return await this.handleSearchConfluence(args);
          case 'get_page':
            return await this.handleGetPage(args);
          case 'get_space':
            return await this.handleGetSpace(args);
          case 'list_spaces':
            return await this.handleListSpaces(args);
          case 'search_pages':
            return await this.handleSearchPages(args);
          case 'get_recent_pages':
            return await this.handleGetRecentPages(args);
          default:
            throw new Error(`Unbekanntes Tool: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Fehler beim Ausführen des Tools ${name}: ${error.message}`,
            },
          ],
        };
      }
    });

    // Resource-Zugriff
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        await this.ensureConfigured();

        switch (uri) {
          case 'confluence://spaces':
            return await this.handleGetSpacesResource();
          case 'confluence://recent-pages':
            return await this.handleGetRecentPagesResource();
          case 'confluence://user':
            return await this.handleGetUserResource();
          default:
            throw new Error(`Unbekannte Resource: ${uri}`);
        }
      } catch (error: any) {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `❌ Fehler beim Laden der Resource: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  private async handleSearchConfluence(args: any) {
    const schema = z.object({
      query: z.string(),
      limit: z.number().optional().default(25),
    });

    const { query, limit } = schema.parse(args);
    const result = await this.confluenceClient!.searchContent(query, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleGetPage(args: any) {
    const schema = z.object({
      pageId: z.string(),
      expand: z.array(z.string()).optional(),
    });

    const { pageId, expand } = schema.parse(args);
    const page = await this.confluenceClient!.getPage(pageId, expand);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(page, null, 2),
        },
      ],
    };
  }

  private async handleGetSpace(args: any) {
    const schema = z.object({
      spaceKey: z.string(),
    });

    const { spaceKey } = schema.parse(args);
    const space = await this.confluenceClient!.getSpace(spaceKey);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(space, null, 2),
        },
      ],
    };
  }

  private async handleListSpaces(args: any) {
    const schema = z.object({
      limit: z.number().optional().default(25),
    });

    const { limit } = schema.parse(args);
    const spaces = await this.confluenceClient!.getSpaces(limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(spaces, null, 2),
        },
      ],
    };
  }

  private async handleSearchPages(args: any) {
    const schema = z.object({
      query: z.string(),
      limit: z.number().optional().default(25),
    });

    const { query, limit } = schema.parse(args);
    const result = await this.confluenceClient!.searchPages(query, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleGetRecentPages(args: any) {
    const schema = z.object({
      limit: z.number().optional().default(10),
    });

    const { limit } = schema.parse(args);
    const result = await this.confluenceClient!.getRecentPages(limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleSetupConfluence(args: any) {
    const schema = z.object({
      action: z.enum(['setup', 'update_token', 'validate']),
      confluenceBaseUrl: z.string().url().optional(),
      confluenceEmail: z.string().email().optional(),
      confluenceApiToken: z.string().min(1).optional(),
    });

    const { action, confluenceBaseUrl, confluenceEmail, confluenceApiToken } = schema.parse(args);

    try {
      switch (action) {
        case 'setup':
          if (!confluenceBaseUrl || !confluenceEmail || !confluenceApiToken) {
            throw new Error('Für setup sind confluenceBaseUrl, confluenceEmail und confluenceApiToken erforderlich');
          }
          
          const newConfig: Config = {
            confluenceBaseUrl,
            confluenceEmail,
            confluenceApiToken,
            logLevel: 'info',
            rateLimitRequests: 100,
            rateLimitWindowMs: 60000,
          };
          
          const isValid = await configManager.validateConfig(newConfig);
          if (isValid) {
            newConfig.lastValidated = new Date().toISOString();
            await configManager.saveConfig(newConfig);
            this.config = newConfig;
            this.confluenceClient = new ConfluenceClient(this.config);
            return {
              content: [
                {
                  type: 'text',
                  text: '✅ Confluence-Konfiguration erfolgreich gespeichert und validiert!',
                },
              ],
            };
          } else {
            throw new Error('Konfiguration ungültig - bitte überprüfen Sie Ihre Eingaben');
          }

        case 'update_token':
          if (!confluenceApiToken) {
            throw new Error('Für update_token ist confluenceApiToken erforderlich');
          }
          
          await configManager.updateToken(confluenceApiToken);
          this.config = configManager.getConfig();
          await this.confluenceClient!.updateConfig(this.config);
          
          return {
            content: [
              {
                type: 'text',
                text: '✅ API-Token erfolgreich aktualisiert!',
              },
            ],
          };

        case 'validate':
          const currentConfig = configManager.getConfig();
          const validationResult = await configManager.validateConfig(currentConfig);
          
          return {
            content: [
              {
                type: 'text',
                text: validationResult 
                  ? '✅ Konfiguration ist gültig'
                  : '❌ Konfiguration ist ungültig - Token möglicherweise abgelaufen',
              },
            ],
          };

        default:
          throw new Error(`Unbekannte Aktion: ${action}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Fehler bei Konfiguration: ${error.message}`,
          },
        ],
      };
    }
  }

  private async handleGetSpacesResource() {
    const spaces = await this.confluenceClient!.getSpaces();
    return {
      contents: [
        {
          uri: 'confluence://spaces',
          mimeType: 'application/json',
          text: JSON.stringify(spaces, null, 2),
        },
      ],
    };
  }

  private async handleGetRecentPagesResource() {
    const recentPages = await this.confluenceClient!.getRecentPages(10);
    return {
      contents: [
        {
          uri: 'confluence://recent-pages',
          mimeType: 'application/json',
          text: JSON.stringify(recentPages, null, 2),
        },
      ],
    };
  }

  private async handleGetUserResource() {
    const user = await this.confluenceClient!.getCurrentUser();
    return {
      contents: [
        {
          uri: 'confluence://user',
          mimeType: 'application/json',
          text: JSON.stringify(user, null, 2),
        },
      ],
    };
  }

  async start() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    } catch (error: any) {
      console.error('❌ Fehler beim Starten des Servers:', error.message);
      process.exit(1);
    }
  }
}