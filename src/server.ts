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

  private validateStorageFormat(content: string): void {
    // Check for Markdown syntax patterns
    const markdownPatterns = [
      /^#+\s/m,                    // Markdown headers
      /\*\*.*\*\*/,              // Markdown bold
      /\*[^*].*[^*]\*/,          // Markdown italic
      /```[\s\S]*?```/,          // Markdown code blocks
      /`[^`]+`/,                 // Markdown inline code
      /^\s*[-*+]\s/m,           // Markdown unordered lists
      /^\s*\d+\.\s/m,           // Markdown ordered lists
      /\[.*?\]\(.*?\)/,          // Markdown links
    ];

    // Check for Atlassian Markup patterns
    const atlassianPatterns = [
      /^h[1-6]\./m,               // Atlassian headers
      /\{info\}/,                // Atlassian info macro
      /\{panel.*?\}/,            // Atlassian panel macro
      /\{code.*?\}/,             // Atlassian code macro
      /\{\{.*?\}\}/,             // Atlassian inline code
      /\{tip\}/,                 // Atlassian tip macro
      /\{warning\}/,             // Atlassian warning macro
      /\{note\}/,                // Atlassian note macro
    ];

    // Check for Storage Format patterns (XML-like)
    const storageFormatPatterns = [
      /<[^>]*>/,                  // XML tags
      /<p>/,                      // Paragraph tags
      /<ac:/,                     // Atlassian custom elements
      /<ri:/,                     // Resource identifier elements
    ];

    // Test for Markdown
    for (const pattern of markdownPatterns) {
      if (pattern.test(content)) {
        throw new Error(`❌ MARKDOWN FORMAT DETECTED: This MCP server only accepts Confluence Storage Format (XML-based).\n\nPlease refer to the 'confluence://storage-format-spec' resource for the complete specification.\n\nExample Storage Format:\n<p>This is a paragraph with <strong>bold text</strong>.</p>\n<ac:structured-macro ac:name="info">\n  <ac:rich-text-body>\n    <p>This is an info box.</p>\n  </ac:rich-text-body>\n</ac:structured-macro>`);
      }
    }

    // Test for Atlassian Markup
    for (const pattern of atlassianPatterns) {
      if (pattern.test(content)) {
        throw new Error(`❌ ATLASSIAN MARKUP FORMAT DETECTED: This MCP server only accepts Confluence Storage Format (XML-based).\n\nPlease refer to the 'confluence://storage-format-spec' resource for the complete specification.\n\nExample Storage Format:\n<p>This is a paragraph with <strong>bold text</strong>.</p>\n<ac:structured-macro ac:name="info">\n  <ac:rich-text-body>\n    <p>This is an info box.</p>\n  </ac:rich-text-body>\n</ac:structured-macro>`);
      }
    }

    // Test for Storage Format (should contain XML-like tags)
    let hasStorageFormat = false;
    for (const pattern of storageFormatPatterns) {
      if (pattern.test(content)) {
        hasStorageFormat = true;
        break;
      }
    }

    if (!hasStorageFormat) {
      throw new Error(`❌ INVALID FORMAT: Content must be in Confluence Storage Format (XML-based).\n\nPlease refer to the 'confluence://storage-format-spec' resource for the complete specification.\n\nExample Storage Format:\n<p>This is a paragraph with <strong>bold text</strong>.</p>\n<ac:structured-macro ac:name="info">\n  <ac:rich-text-body>\n    <p>This is an info box.</p>\n  </ac:rich-text-body>\n</ac:structured-macro>`);
    }
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
          description: 'Creates a new Confluence page. Content MUST be in Confluence Storage Format (XML-based). Markdown and Atlassian Markup are NOT supported. See the \'confluence://storage-format-spec\' resource for the complete specification.',
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
                description: 'Page content in Confluence Storage Format (XML-based) ONLY. Markdown and Atlassian Markup are NOT supported. See the \'confluence://storage-format-spec\' resource for the complete specification.',
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
          description: 'Updates an existing Confluence page. Content MUST be in Confluence Storage Format (XML-based). Markdown and Atlassian Markup are NOT supported. See the \'confluence://storage-format-spec\' resource for the complete specification.',
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
                description: 'New page content in Confluence Storage Format (XML-based) ONLY. Markdown and Atlassian Markup are NOT supported. See the \'confluence://storage-format-spec\' resource for the complete specification.',
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
        {
          uri: 'confluence://storage-format-spec',
          name: 'Confluence Storage Format Specification',
          description: 'Complete specification for Confluence Storage Format (XML-based content format)',
          mimeType: 'text/markdown',
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
          case 'confluence://storage-format-spec':
            return await this.handleGetStorageFormatSpec();
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

    // Validate content format
    this.validateStorageFormat(content);

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

    // Validate content format
    this.validateStorageFormat(content);

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

  private async handleGetStorageFormatSpec() {
    const specification = `# Confluence Storage Format Specification

## Overview
The Confluence Storage Format is an XML-based markup language used to store and represent content in Confluence, including pages, blog posts, comments, and templates.

## Key Characteristics
- XML-based, but not strictly XHTML compliant
- Includes custom elements for macros and special formatting
- Supports rich text, links, images, tables, layouts, and more

## Major XML Elements and Formatting

### 1. Text Formatting
- **Headings**: \`<h1>\`, \`<h2>\`, \`<h3>\` through \`<h6>\`
- **Text Effects**: \`<strong>\`, \`<em>\`, \`<u>\`, \`<sup>\`, \`<sub>\`, \`<code>\`
- **Alignment**: \`<p style="text-align: center/right">\`
- **Line Breaks**: \`<br/>\`

### 2. Paragraphs
- Basic paragraph: \`<p>Content here</p>\`
- Styled paragraph: \`<p style="text-align: center">Centered text</p>\`

### 3. Lists
- **Unordered**: \`<ul><li>Item 1</li><li>Item 2</li></ul>\`
- **Ordered**: \`<ol><li>First item</li><li>Second item</li></ol>\`
- **Task Lists**: 
  \`\`\`xml
  <ac:task-list>
    <ac:task>
      <ac:task-status>COMPLETE</ac:task-status>
      <ac:task-body>Completed task</ac:task-body>
    </ac:task>
    <ac:task>
      <ac:task-status>INCOMPLETE</ac:task-status>
      <ac:task-body>Incomplete task</ac:task-body>
    </ac:task>
  </ac:task-list>
  \`\`\`

### 4. Links
- **Confluence Page**: 
  \`\`\`xml
  <ac:link>
    <ri:page ri:content-title="Page Title"/>
    <ac:plain-text-link-body>Link Text</ac:plain-text-link-body>
  </ac:link>
  \`\`\`
- **External**: \`<a href="https://example.com">Link text</a>\`
- **Attachments**: 
  \`\`\`xml
  <ac:link>
    <ri:attachment ri:filename="document.pdf"/>
    <ac:plain-text-link-body>Download PDF</ac:plain-text-link-body>
  </ac:link>
  \`\`\`

### 5. Images
- **Attached Image**: 
  \`\`\`xml
  <ac:image>
    <ri:attachment ri:filename="image.png"/>
  </ac:image>
  \`\`\`
- **External Image**: 
  \`\`\`xml
  <ac:image>
    <ri:url ri:value="https://example.com/image.png"/>
  </ac:image>
  \`\`\`

### 6. Tables
Standard HTML table structure:
\`\`\`xml
<table>
  <tbody>
    <tr>
      <th>Header 1</th>
      <th>Header 2</th>
    </tr>
    <tr>
      <td>Cell 1</td>
      <td>Cell 2</td>
    </tr>
  </tbody>
</table>
\`\`\`

### 7. Macros (Structured Macros)
- **Info Macro**: 
  \`\`\`xml
  <ac:structured-macro ac:name="info">
    <ac:rich-text-body>
      <p>This is an info box.</p>
    </ac:rich-text-body>
  </ac:structured-macro>
  \`\`\`
- **Warning Macro**: 
  \`\`\`xml
  <ac:structured-macro ac:name="warning">
    <ac:rich-text-body>
      <p>This is a warning.</p>
    </ac:rich-text-body>
  </ac:structured-macro>
  \`\`\`
- **Code Macro**: 
  \`\`\`xml
  <ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">javascript</ac:parameter>
    <ac:plain-text-body>
      console.log("Hello World");
    </ac:plain-text-body>
  </ac:structured-macro>
  \`\`\`

### 8. Page Layouts
- **Layout Structure**: 
  \`\`\`xml
  <ac:layout>
    <ac:layout-section ac:type="two_equal">
      <ac:layout-cell>
        <p>Left column content</p>
      </ac:layout-cell>
      <ac:layout-cell>
        <p>Right column content</p>
      </ac:layout-cell>
    </ac:layout-section>
  </ac:layout>
  \`\`\`

### 9. Resource Identifiers
Resource identifiers represent links to pages, blog posts, attachments, users, spaces:
- \`<ri:page ri:content-title="Page Title"/>\`
- \`<ri:attachment ri:filename="file.pdf"/>\`
- \`<ri:user ri:userkey="username"/>\`
- \`<ri:space ri:space-key="SPACEKEY"/>\`

## Example Complete Page
\`\`\`xml
<p>This is a paragraph with <strong>bold text</strong> and <em>italic text</em>.</p>

<h2>Section Header</h2>

<ac:structured-macro ac:name="info">
  <ac:rich-text-body>
    <p>This is an information box with important details.</p>
  </ac:rich-text-body>
</ac:structured-macro>

<ul>
  <li>First bullet point</li>
  <li>Second bullet point</li>
  <li>Third bullet point</li>
</ul>

<p>Here's a link to <ac:link><ri:page ri:content-title="Another Page"/><ac:plain-text-link-body>another page</ac:plain-text-link-body></ac:link>.</p>

<ac:structured-macro ac:name="code">
  <ac:parameter ac:name="language">python</ac:parameter>
  <ac:plain-text-body>
def hello_world():
    print("Hello, World!")
  </ac:plain-text-body>
</ac:structured-macro>
\`\`\`

## Important Notes
- All content must be properly XML-escaped
- Custom namespaces: \`ac:\` for Atlassian custom elements, \`ri:\` for resource identifiers
- Macros use \`ac:structured-macro\` with parameters and body content
- Links to Confluence content use resource identifiers rather than URLs
- Always close XML tags properly
- Use proper nesting of elements

## Common Mistakes to Avoid
- Don't use Markdown syntax (##, **, \`\`\`)
- Don't use Atlassian Markup syntax (h1., {info}, {code})
- Don't forget to close XML tags
- Don't use unescaped special characters in text content`;

    return {
      contents: [
        {
          uri: 'confluence://storage-format-spec',
          mimeType: 'text/markdown',
          text: specification,
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