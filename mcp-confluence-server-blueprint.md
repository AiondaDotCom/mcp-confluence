# MCP Confluence Server Blueprint

## Überblick

Dieser Bauplan beschreibt die Implementierung eines TypeScript MCP (Model Context Protocol) Servers, der die Confluence API von Atlassian integriert. Der Server läuft über STDIO und authentifiziert sich mit persönlichen API-Tokens.

## Architektur

```
mcp-confluence-server/
├── src/
│   ├── index.ts              # STDIO-Eintrittspunkt
│   ├── server.ts             # Haupt-MCP-Server-Klasse
│   ├── confluence/
│   │   ├── client.ts         # Confluence API-Client
│   │   ├── types.ts          # TypeScript-Typen für Confluence
│   │   └── auth.ts           # Authentifizierungslogik
│   ├── resources/
│   │   ├── pages.ts          # Seiten-Resource-Handler
│   │   ├── spaces.ts         # Bereiche-Resource-Handler
│   │   └── search.ts         # Such-Resource-Handler
│   ├── tools/
│   │   ├── search.ts         # Such-Tool-Handler
│   │   ├── get-content.ts    # Inhalt-Abrufen-Tool
│   │   └── get-space.ts      # Bereich-Abrufen-Tool
│   ├── config/
│   │   └── index.ts          # Konfigurationsmanagement
│   └── utils/
│       ├── validation.ts     # Input-Validierung
│       └── errors.ts         # Fehlerbehandlung
├── package.json
├── tsconfig.json
└── README.md
```

## Kern-Abhängigkeiten

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

## Konfiguration

### Environment-Variablen

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

### .env-Datei

```env
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token
LOG_LEVEL=info
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

## Authentifizierung

### API-Token-Authentifizierung

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

## Confluence API-Client

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
    // Implementierung eines einfachen Rate-Limiting-Mechanismus
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

## TypeScript-Typen

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

## MCP-Server-Implementierung

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
    // Lade und validiere Konfiguration
    this.config = await configManager.ensureValidConfig();
    this.confluenceClient = new ConfluenceClient(this.config);
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
      ],
    }));

    // Tool-Aufrufe
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
            throw new Error(`Unbekanntes Tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Fehler beim Ausführen des Tools ${name}: ${error.message}`,
            },
          ],
        };
      }
    });

    // Resource-Zugriff
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        switch (uri) {
          case 'confluence://spaces':
            return await this.handleGetSpacesResource();
          case 'confluence://recent-pages':
            return await this.handleGetRecentPagesResource();
          default:
            throw new Error(`Unbekannte Resource: ${uri}`);
        }
      } catch (error) {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Fehler beim Laden der Resource: ${error.message}`,
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
    const result = await this.confluenceClient.searchContent(query, limit);

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
    const page = await this.confluenceClient.getPage(pageId, expand);

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
    const space = await this.confluenceClient.getSpace(spaceKey);

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
    const spaces = await this.confluenceClient.getSpaces(limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(spaces, null, 2),
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
          await this.confluenceClient.updateConfig(this.config);
          
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
    } catch (error) {
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
    const spaces = await this.confluenceClient.getSpaces();
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
    const recentPages = await this.confluenceClient.searchContent(
      'type=page ORDER BY lastModified DESC',
      10
    );
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

  async start() {
    try {
      await this.initialize();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    } catch (error) {
      console.error('❌ Fehler beim Starten des Servers:', error.message);
      process.exit(1);
    }
  }
}
```

## STDIO-Eintrittspunkt

```typescript
// index.ts
import { ConfluenceMCPServer } from './server.js';

async function main() {
  const server = new ConfluenceMCPServer();
  await server.start();
}

main().catch((error) => {
  console.error('Fehler beim Starten des MCP-Servers:', error);
  process.exit(1);
});
```

## Fehlerbehandlung

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
  constructor(message: string = 'Authentifizierung fehlgeschlagen') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends ConfluenceAPIError {
  constructor(message: string = 'API-Token ist abgelaufen') {
    super(message, 401);
    this.name = 'TokenExpiredError';
  }
}

export class RateLimitError extends ConfluenceAPIError {
  constructor(message: string = 'Rate Limit überschritten') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}
```

## Validierung

```typescript
// utils/validation.ts
import { z } from 'zod';

export const pageIdSchema = z.string().min(1);
export const spaceKeySchema = z.string().min(1);
export const cqlQuerySchema = z.string().min(1);
export const limitSchema = z.number().int().min(1).max(1000);

export function validatePageId(pageId: unknown): string {
  return pageIdSchema.parse(pageId);
}

export function validateSpaceKey(spaceKey: unknown): string {
  return spaceKeySchema.parse(spaceKey);
}

export function validateCQLQuery(query: unknown): string {
  return cqlQuerySchema.parse(query);
}

export function validateLimit(limit: unknown): number {
  return limitSchema.parse(limit);
}
```

## Build-Konfiguration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "allowSyntheticDefaultImports": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts"
  ]
}
```

### package.json Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

## Testing

### Jest-Konfiguration

```typescript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
```

### Beispiel-Test

```typescript
// src/__tests__/confluence-client.test.ts
import { ConfluenceClient } from '../confluence/client';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ConfluenceClient', () => {
  let client: ConfluenceClient;

  beforeEach(() => {
    client = new ConfluenceClient();
  });

  it('should authenticate with correct headers', () => {
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Basic'),
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should get page by ID', async () => {
    const mockPage = { id: '123', title: 'Test Page' };
    mockedAxios.get.mockResolvedValue({ data: mockPage });

    const result = await client.getPage('123');
    expect(result).toEqual(mockPage);
  });
});
```

## Deployment

### Docker-Unterstützung

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

USER node

CMD ["node", "dist/index.js"]
```

### Verpackung als Executable

```json
{
  "scripts": {
    "build:exe": "pkg package.json --target node18-linux-x64,node18-win-x64,node18-macos-x64 --out-path dist-exe"
  },
  "pkg": {
    "scripts": "dist/**/*.js",
    "assets": "dist/**/*"
  }
}
```

## Sicherheitsüberlegungen

1. **Token-Sicherheit**
   - Tokens niemals in Code oder Logs speichern
   - Sichere Speicherung in config.json mit angemessenen Dateiberechtigungen
   - Automatische Token-Erneuerung bei Ablauf
   - Regelmäßige Validierung der Token-Gültigkeit

2. **Input-Validierung**
   - Alle Eingaben mit Zod validieren
   - CQL-Injection-Schutz
   - Begrenzte Abfragegrößen

3. **Rate Limiting**
   - Implementierung von Client-seitigem Rate Limiting
   - Exponential Backoff bei Fehlern
   - Monitoring von API-Limits

4. **Fehlerbehandlung**
   - Keine sensiblen Daten in Fehlermeldungen
   - Proper Logging ohne Token-Exposition
   - Graceful Degradation bei API-Fehlern

## Erweiterte Features

### Caching

```typescript
// utils/cache.ts
import { LRUCache } from 'lru-cache';

interface CacheOptions {
  maxSize: number;
  ttl: number;
}

export class ConfluenceCache {
  private cache: LRUCache<string, any>;

  constructor(options: CacheOptions) {
    this.cache = new LRUCache({
      max: options.maxSize,
      ttl: options.ttl,
    });
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Logging

```typescript
// utils/logger.ts
import { Config } from '../config';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private level: LogLevel;

  constructor(config: Config) {
    this.level = this.getLogLevel(config.logLevel);
  }

  private getLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}
```

## Benutzerfreundliche Konfiguration

### MCP-Tool für Konfiguration

Der Server stellt ein spezielles Tool `setup_confluence` zur Verfügung, das die KI nutzen kann, um den Server zu konfigurieren:

```typescript
// Beispiel: Erstkonfiguration über MCP-Tool
{
  "name": "setup_confluence",
  "arguments": {
    "action": "setup",
    "confluenceBaseUrl": "https://your-domain.atlassian.net",
    "confluenceEmail": "your-email@example.com",
    "confluenceApiToken": "your-api-token"
  }
}

// Token erneuern
{
  "name": "setup_confluence",
  "arguments": {
    "action": "update_token",
    "confluenceApiToken": "new-api-token"
  }
}

// Konfiguration validieren
{
  "name": "setup_confluence",
  "arguments": {
    "action": "validate"
  }
}
```

### Automatisches Token-Management

1. **Token-Validierung**: Bei jedem Start wird die Konfiguration validiert
2. **Ablauf-Erkennung**: Server erkennt automatisch abgelaufene oder ungültige Tokens
3. **Interaktive Erneuerung**: Bei Problemen fordert der Server über die KI einen neuen Token an
4. **Nahtlose Integration**: Benutzer muss keine Konfigurationsdateien manuell bearbeiten

### Workflow für Benutzer

1. **Erststart**: Server startet mit leerer `config.json`
2. **Automatisches Setup**: Server fordert über KI die Konfigurationsdaten an
3. **Validierung**: Konfiguration wird getestet und gespeichert
4. **Normaler Betrieb**: Server funktioniert ohne weitere Benutzerinteraktion
5. **Token-Erneuerung**: Bei Ablauf fordert Server automatisch neuen Token an

### Vorteile dieses Ansatzes

- **Keine manuellen Konfigurationsdateien**: Benutzer müssen keine `.env` oder Konfigurationsdateien erstellen
- **Automatische Validierung**: Konfiguration wird sofort getestet
- **Intelligente Fehlerbehebung**: Bei Problemen wird automatisch nach Lösungen gefragt
- **Sichere Speicherung**: Token werden sicher in `config.json` gespeichert
- **Einfache Wartung**: Token-Erneuerung erfolgt über die KI-Schnittstelle

## Nächste Schritte

1. **Implementierung starten**
   - Projekt-Setup mit TypeScript und Dependencies
   - ConfigManager-Klasse implementieren
   - Interaktive Konfiguration testen

2. **Testing und Debugging**
   - Unit-Tests für ConfigManager
   - Integration-Tests mit Mock-API
   - Manuelle Tests mit echter Confluence-Instanz

3. **Benutzerfreundlichkeit**
   - Klare Fehlermeldungen implementieren
   - Hilfreiche Anleitungen für Token-Erstellung
   - Automatische Konfigurationsprüfung

4. **Optimierung**
   - Performance-Monitoring
   - Caching-Strategien
   - Error-Recovery-Mechanismen

Dieser Bauplan bietet eine benutzerfreundliche, selbstkonfigurierende Lösung für einen robusten MCP-Server für Confluence.