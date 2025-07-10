# MCP Confluence Server Blueprint

## Overview

This blueprint describes the implementation of a TypeScript MCP (Model Context Protocol) server that integrates the Atlassian Confluence API. The server runs over STDIO and authenticates using personal API tokens.

## Architecture

```
mcp-confluence-server/
├── src/
│   ├── index.ts              # STDIO entry point
│   ├── server.ts             # Main MCP server class
│   ├── confluence/
│   │   ├── client.ts         # Confluence API client
│   │   ├── types.ts          # TypeScript types for Confluence
│   │   └── auth.ts           # Authentication logic
│   ├── resources/
│   │   ├── pages.ts          # Pages resource handler
│   │   ├── spaces.ts         # Spaces resource handler
│   │   └── search.ts         # Search resource handler
│   ├── tools/
│   │   ├── search.ts         # Search tool handler
│   │   ├── get-content.ts    # Content retrieval tool
│   │   └── get-space.ts      # Space retrieval tool
│   ├── config/
│   │   └── index.ts          # Configuration management
│   └── utils/
│       ├── validation.ts     # Input validation
│       └── errors.ts         # Error handling
├── package.json
├── tsconfig.json
└── README.md
```

## Core Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "axios": "^1.6.0",
    "zod": "^3.22.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0"
  }
}
```

## Configuration

### Environment Variables

```typescript
// config/index.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  CONFLUENCE_BASE_URL: z.string().url(),
  CONFLUENCE_EMAIL: z.string().email(),
  CONFLUENCE_API_TOKEN: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_REQUESTS: z.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.number().int().positive().default(60000),
});

export const config = configSchema.parse({
  CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
  CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL,
  CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN,
  LOG_LEVEL: process.env.LOG_LEVEL,
  RATE_LIMIT_REQUESTS: process.env.RATE_LIMIT_REQUESTS ? parseInt(process.env.RATE_LIMIT_REQUESTS) : undefined,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS) : undefined,
});
```

### .env File

```env
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token
LOG_LEVEL=info
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

## Authentication

### API Token Authentication

```typescript
// confluence/auth.ts
import { config } from '../config';

export class ConfluenceAuth {
  private readonly email: string;
  private readonly token: string;

  constructor() {
    this.email = config.CONFLUENCE_EMAIL;
    this.token = config.CONFLUENCE_API_TOKEN;
  }

  getAuthHeaders(): Record<string, string> {
    const auth = Buffer.from(`${this.email}:${this.token}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }
}
```

## Confluence API Client

```typescript
// confluence/client.ts
import axios, { AxiosInstance } from 'axios';
import { ConfluenceAuth } from './auth';
import { config } from '../config';
import { 
  ConfluencePage, 
  ConfluenceSpace, 
  ConfluenceSearchResult,
  ConfluenceAttachment 
} from './types';

export class ConfluenceClient {
  private readonly client: AxiosInstance;
  private readonly auth: ConfluenceAuth;

  constructor() {
    this.auth = new ConfluenceAuth();
    this.client = axios.create({
      baseURL: `${config.CONFLUENCE_BASE_URL}/wiki/rest/api`,
      headers: this.auth.getAuthHeaders(),
      timeout: 30000,
    });

    // Rate limiting interceptor
    this.setupRateLimiting();
  }

  private setupRateLimiting() {
    // Implementation of a simple rate limiting mechanism
    let requestCount = 0;
    let windowStart = Date.now();

    this.client.interceptors.request.use((config) => {
      const now = Date.now();
      if (now - windowStart > config.RATE_LIMIT_WINDOW_MS) {
        requestCount = 0;
        windowStart = now;
      }

      if (requestCount >= config.RATE_LIMIT_REQUESTS) {
        throw new Error('Rate limit exceeded');
      }

      requestCount++;
      return config;
    });
  }

  async getPage(pageId: string, expand?: string[]): Promise<ConfluencePage> {
    const response = await this.client.get(`/content/${pageId}`, {
      params: {
        expand: expand?.join(',') || 'body.storage,version,space',
      },
    });
    return response.data;
  }

  async getSpace(spaceKey: string): Promise<ConfluenceSpace> {
    const response = await this.client.get(`/space/${spaceKey}`);
    return response.data;
  }

  async searchContent(cql: string, limit = 25, cursor?: string): Promise<ConfluenceSearchResult> {
    const response = await this.client.get('/content/search', {
      params: {
        cql,
        limit,
        cursor,
      },
    });
    return response.data;
  }

  async getSpaces(limit = 25, cursor?: string): Promise<{ results: ConfluenceSpace[]; _links: any }> {
    const response = await this.client.get('/space', {
      params: {
        limit,
        cursor,
      },
    });
    return response.data;
  }

  async getAttachment(attachmentId: string): Promise<ConfluenceAttachment> {
    const response = await this.client.get(`/content/${attachmentId}`);
    return response.data;
  }
}
```

## TypeScript Types

```typescript
// confluence/types.ts
export interface ConfluencePage {
  id: string;
  type: string;
  title: string;
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
    view?: {
      value: string;
      representation: string;
    };
  };
  version?: {
    number: number;
    when: string;
    by: {
      displayName: string;
      email: string;
    };
  };
  space?: {
    key: string;
    name: string;
  };
  _links?: {
    webui: string;
    self: string;
  };
}

export interface ConfluenceSpace {
  key: string;
  name: string;
  type: string;
  description?: {
    plain?: {
      value: string;
    };
  };
  _links?: {
    webui: string;
    self: string;
  };
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  size: number;
  totalSize: number;
  _links?: {
    next?: string;
    prev?: string;
  };
}

export interface ConfluenceAttachment {
  id: string;
  type: string;
  title: string;
  mediaType: string;
  fileSize: number;
  _links?: {
    download: string;
    webui: string;
  };
}
```

## MCP Server Implementation

```typescript
// server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ConfluenceClient } from './confluence/client.js';
import { Config, configManager } from './config/index.js';
import { z } from 'zod';

export class ConfluenceMCPServer {
  private server: Server;
  private confluenceClient: ConfluenceClient;
  private config: Config;

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

  async initialize(): Promise<void> {
    // Load and validate configuration
    this.config = await configManager.ensureValidConfig();
    this.confluenceClient = new ConfluenceClient(this.config);
  }

  private setupHandlers() {
    // Tools handler
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

    // Resources handler
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
      ],
    }));

    // Tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_confluence':
            return await this.handleSearchConfluence(args);
          case 'get_page':
            return await this.handleGetPage(args);
          case 'get_space':
            return await this.handleGetSpace(args);
          case 'list_spaces':
            return await this.handleListSpaces(args);
          case 'setup_confluence':
            return await this.handleSetupConfluence(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error.message}`,
            },
          ],
        };
      }
    });

    // Resource access
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        switch (uri) {
          case 'confluence://spaces':
            return await this.handleGetSpacesResource();
          case 'confluence://recent-pages':
            return await this.handleGetRecentPagesResource();
          default:
            throw new Error(`Unknown resource: ${uri}`);
        }
      } catch (error) {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Error loading resource: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  // ... (rest of implementation methods)
}
```

## Error Handling

```typescript
// utils/errors.ts
export class ConfluenceAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ConfluenceAPIError';
  }
}

export class AuthenticationError extends ConfluenceAPIError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends ConfluenceAPIError {
  constructor(message: string = 'API token has expired') {
    super(message, 401);
    this.name = 'TokenExpiredError';
  }
}

export class RateLimitError extends ConfluenceAPIError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}
```

## Security Considerations

1. **Token Security**
   - Never store tokens in code or logs
   - Secure storage in config.json with appropriate file permissions
   - Automatic token renewal upon expiration
   - Regular validation of token validity

2. **Input Validation**
   - Validate all inputs with Zod
   - CQL injection protection
   - Limited query sizes

3. **Rate Limiting**
   - Implementation of client-side rate limiting
   - Exponential backoff on errors
   - Monitoring of API limits

4. **Error Handling**
   - No sensitive data in error messages
   - Proper logging without token exposure
   - Graceful degradation on API errors

## User-Friendly Configuration

### MCP Tool for Configuration

The server provides a special `setup_confluence` tool that the AI can use to configure the server:

```typescript
// Example: Initial configuration via MCP tool
{
  "name": "setup_confluence",
  "arguments": {
    "action": "setup",
    "confluenceBaseUrl": "https://your-domain.atlassian.net",
    "confluenceEmail": "your-email@example.com",
    "confluenceApiToken": "your-api-token"
  }
}

// Renew token
{
  "name": "setup_confluence",
  "arguments": {
    "action": "update_token",
    "confluenceApiToken": "new-api-token"
  }
}

// Validate configuration
{
  "name": "setup_confluence",
  "arguments": {
    "action": "validate"
  }
}
```

### Automatic Token Management

1. **Token Validation**: Configuration is validated on every start
2. **Expiration Detection**: Server automatically detects expired or invalid tokens
3. **Interactive Renewal**: On problems, server requests new token via AI
4. **Seamless Integration**: User doesn't need to manually edit configuration files

### User Workflow

1. **Initial Start**: Server starts with empty `config.json`
2. **Automatic Setup**: Server requests configuration data via AI
3. **Validation**: Configuration is tested and saved
4. **Normal Operation**: Server functions without further user interaction
5. **Token Renewal**: On expiration, server automatically requests new token

### Advantages of This Approach

- **No manual configuration files**: Users don't need to create `.env` or configuration files
- **Automatic validation**: Configuration is immediately tested
- **Intelligent troubleshooting**: Problems are automatically addressed
- **Secure storage**: Tokens are securely stored in `config.json`
- **Easy maintenance**: Token renewal happens via AI interface

This blueprint provides a user-friendly, self-configuring solution for a robust MCP server for Confluence.