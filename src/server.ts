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
      // Try to load config without interactive setup
      this.config = await configManager.loadConfig();
      this.confluenceClient = new ConfluenceClient(this.config);
    } catch (error: any) {
      // Config not available or invalid
      throw new Error('No valid configuration found. Please use the setup_confluence tool to configure the connection.');
    }
  }

  private setupHandlers() {
    // Tools Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_confluence',
          description: 'Search Confluence content using CQL (Confluence Query Language)',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'CQL search query (e.g. "type=page AND space=DEMO")',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 25)',
                default: 25,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_page',
          description: 'Retrieve a specific Confluence page',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: {
                type: 'string',
                description: 'Confluence page ID',
              },
              expand: {
                type: 'array',
                items: { type: 'string' },
                description: 'Fields to expand (e.g. ["body.storage", "version"])',
              },
            },
            required: ['pageId'],
          },
        },
        {
          name: 'get_space',
          description: 'Retrieve information about a Confluence space',
          inputSchema: {
            type: 'object',
            properties: {
              spaceKey: {
                type: 'string',
                description: 'Confluence space key',
              },
            },
            required: ['spaceKey'],
          },
        },
        {
          name: 'list_spaces',
          description: 'List all available Confluence spaces',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 25)',
                default: 25,
              },
            },
          },
        },
        {
          name: 'search_pages',
          description: 'Search Confluence pages by title or content',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search term for title or content',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 25)',
                default: 25,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_recent_pages',
          description: 'Retrieve recently modified pages',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10)',
                default: 10,
              },
            },
          },
        },
        {
          name: 'create_page',
          description: '⚠️ IMPORTANT: Creates a new Confluence page. Content MUST be in Atlassian Markup Format! Standard Markdown is NOT supported!',
          inputSchema: {
            type: 'object',
            properties: {
              spaceKey: {
                type: 'string',
                description: 'Confluence space key',
              },
              title: {
                type: 'string',
                description: 'Title of the new page',
              },
              content: {
                type: 'string',
                description: '⚠️ CRITICAL: Page content in Atlassian Markup Format (not Markdown!). Example: {info}This is an info box{info}',
              },
              parentId: {
                type: 'string',
                description: 'ID of the parent page (optional)',
              },
            },
            required: ['spaceKey', 'title', 'content'],
          },
        },
        {
          name: 'update_page',
          description: '⚠️ IMPORTANT: Updates an existing Confluence page. Content MUST be in Atlassian Markup Format! Standard Markdown is NOT supported!',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: {
                type: 'string',
                description: 'ID of the page to update',
              },
              title: {
                type: 'string',
                description: 'New title of the page (optional)',
              },
              content: {
                type: 'string',
                description: '⚠️ CRITICAL: New page content in Atlassian Markup Format (not Markdown!). Example: {panel}Content{panel}',
              },
            },
            required: ['pageId', 'content'],
          },
        },
        {
          name: 'setup_confluence',
          description: 'Configure or reconfigure the Confluence connection',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['setup', 'update_token', 'validate'],
                description: 'Action: setup (initial configuration), update_token (renew token), validate (check configuration)',
              },
              confluenceBaseUrl: {
                type: 'string',
                description: 'Confluence Base URL (only for setup)',
              },
              confluenceEmail: {
                type: 'string',
                description: 'Email address (only for setup)',
              },
              confluenceApiToken: {
                type: 'string',
                description: 'API token (for setup and update_token)',
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
          description: 'List of all available Confluence spaces',
          mimeType: 'application/json',
        },
        {
          uri: 'confluence://recent-pages',
          name: 'Recent Pages',
          description: 'Recently updated pages',
          mimeType: 'application/json',
        },
        {
          uri: 'confluence://user',
          name: 'Current User',
          description: 'Information about the current user',
          mimeType: 'application/json',
        },
      ],
    }));

    // Tool-Aufrufe
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Special handling for setup_confluence - no configuration required
        if (name === 'setup_confluence') {
          return await this.handleSetupConfluence(args);
        }

        // For all other tools: ensure configuration is present
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
          case 'create_page':
            return await this.handleCreatePage(args);
          case 'update_page':
            return await this.handleUpdatePage(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error executing tool ${name}: ${error.message}`,
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
            throw new Error(`Unknown resource: ${uri}`);
        }
      } catch (error: any) {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `❌ Error loading resource: ${error.message}`,
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

  private async handleCreatePage(args: any) {
    const schema = z.object({
      spaceKey: z.string(),
      title: z.string(),
      content: z.string(),
      parentId: z.string().optional(),
    });

    const { spaceKey, title, content, parentId } = schema.parse(args);

    // Strong warning about Atlassian Markup Format
    if (content.includes('```') || content.includes('##') || content.includes('**')) {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ ERROR: The provided content appears to contain Markdown! Confluence uses Atlassian Markup Format, not standard Markdown.\n\n' +
                  'Examples of Atlassian Markup:\n' +
                  '- Headings: h1. Heading\n' +
                  '- Bold: *bold*\n' +
                  '- Italic: _italic_\n' +
                  '- Info Box: {info}Content{info}\n' +
                  '- Panel: {panel}Content{panel}\n' +
                  '- Code: {code}code{code}\n\n' +
                  'Please convert the content to Atlassian Markup Format!',
          },
        ],
      };
    }

    try {
      const page = await this.confluenceClient!.createPage(spaceKey, title, content, parentId);
      return {
        content: [
          {
            type: 'text',
            text: `✅ Page "${title}" successfully created!\n\n${JSON.stringify(page, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error creating page: ${error.message}\n\n⚠️ Please ensure the content is in Atlassian Markup Format!`,
          },
        ],
      };
    }
  }

  private async handleUpdatePage(args: any) {
    const schema = z.object({
      pageId: z.string(),
      title: z.string().optional(),
      content: z.string(),
    });

    const { pageId, title, content } = schema.parse(args);

    // Strong warning about Atlassian Markup Format
    if (content.includes('```') || content.includes('##') || content.includes('**')) {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ ERROR: The provided content appears to contain Markdown! Confluence uses Atlassian Markup Format, not standard Markdown.\n\n' +
                  'Examples of Atlassian Markup:\n' +
                  '- Headings: h1. Heading\n' +
                  '- Bold: *bold*\n' +
                  '- Italic: _italic_\n' +
                  '- Info Box: {info}Content{info}\n' +
                  '- Panel: {panel}Content{panel}\n' +
                  '- Code: {code}code{code}\n\n' +
                  'Please convert the content to Atlassian Markup Format!',
          },
        ],
      };
    }

    try {
      const page = await this.confluenceClient!.updatePage(pageId, title, content);
      return {
        content: [
          {
            type: 'text',
            text: `✅ Page successfully updated!\n\n${JSON.stringify(page, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error updating page: ${error.message}\n\n⚠️ Please ensure the content is in Atlassian Markup Format!`,
          },
        ],
      };
    }
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
            throw new Error('For setup, confluenceBaseUrl, confluenceEmail and confluenceApiToken are required');
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
                  text: '✅ Confluence configuration successfully saved and validated!',
                },
              ],
            };
          } else {
            throw new Error('Configuration invalid - please check your inputs');
          }

        case 'update_token':
          if (!confluenceApiToken) {
            throw new Error('For update_token, confluenceApiToken is required');
          }
          
          await configManager.updateToken(confluenceApiToken);
          this.config = configManager.getConfig();
          await this.confluenceClient!.updateConfig(this.config);
          
          return {
            content: [
              {
                type: 'text',
                text: '✅ API token successfully updated!',
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
                  ? '✅ Configuration is valid'
                  : '❌ Configuration is invalid - token may have expired',
              },
            ],
          };

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Configuration error: ${error.message}`,
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
      console.error('❌ Error starting server:', error.message);
      process.exit(1);
    }
  }
}