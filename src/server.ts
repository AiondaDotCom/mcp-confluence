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

  private processContent(content: string): string {
    // If content is already in proper Atlassian format, return as is
    if (content.includes('{info}') || content.includes('{panel}') || content.includes('{code}') || content.includes('h1.') || content.includes('h2.')) {
      return content;
    }

    // If content looks like modern HTML (from new Confluence editor), return as is
    if (content.includes('<h1>') || content.includes('<div class="confluence-information-macro">')) {
      return content;
    }

    // Convert common Markdown patterns to Atlassian Markup
    let processedContent = content;

    // Convert headers
    processedContent = processedContent.replace(/^# (.*)/gm, 'h1. $1');
    processedContent = processedContent.replace(/^## (.*)/gm, 'h2. $1');
    processedContent = processedContent.replace(/^### (.*)/gm, 'h3. $1');
    processedContent = processedContent.replace(/^#### (.*)/gm, 'h4. $1');
    processedContent = processedContent.replace(/^##### (.*)/gm, 'h5. $1');
    processedContent = processedContent.replace(/^###### (.*)/gm, 'h6. $1');

    // Convert bold and italic
    processedContent = processedContent.replace(/\*\*(.*?)\*\*/g, '*$1*');
    processedContent = processedContent.replace(/\*(.*?)\*/g, '_$1_');

    // Convert code blocks
    processedContent = processedContent.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      if (lang) {
        return `{code:${lang}}\n${code.trim()}\n{code}`;
      }
      return `{code}\n${code.trim()}\n{code}`;
    });

    // Convert inline code
    processedContent = processedContent.replace(/`([^`]+)`/g, '{{$1}}');

    // Convert unordered lists
    processedContent = processedContent.replace(/^[\s]*[-*+] (.*)/gm, '* $1');

    // Convert ordered lists
    processedContent = processedContent.replace(/^[\s]*\d+\. (.*)/gm, '# $1');

    // Convert links
    processedContent = processedContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]');

    return processedContent;
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
          description: 'Creates a new Confluence page. Content can be in Markdown or Atlassian Markup Format - will be automatically converted.',
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
                description: 'Page content in Markdown or Atlassian Markup Format. Will be automatically converted to the appropriate format.',
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
          description: 'Updates an existing Confluence page. Content can be in Markdown or Atlassian Markup Format - will be automatically converted.',
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
                description: 'New page content in Markdown or Atlassian Markup Format. Will be automatically converted to the appropriate format.',
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

    // Convert content to appropriate format
    const processedContent = this.processContent(content);

    try {
      const page = await this.confluenceClient!.createPage(spaceKey, title, processedContent, parentId);
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
            text: `❌ Error creating page: ${error.message}`,
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

    // Convert content to appropriate format
    const processedContent = this.processContent(content);

    try {
      const page = await this.confluenceClient!.updatePage(pageId, title, processedContent);
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
            text: `❌ Error updating page: ${error.message}`,
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